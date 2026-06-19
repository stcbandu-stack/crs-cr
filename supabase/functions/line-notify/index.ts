// LINE group notifications for job orders.
//
// Routes:
//   POST /line-notify                — called by the DB trigger (private.notify_line)
//                                      auth: x-notify-secret header (NOTIFY_SECRET)
//   POST /line-notify/find-group-id  — set temporarily as the LINE webhook URL to
//                                      discover the group ID from function logs
//
// Deploy with verify_jwt = false: this function is invoked by DB triggers / pg_cron
// via pg_net WITHOUT a JWT, and authenticates itself with the x-notify-secret header.
//
// Required Edge Function secrets (Dashboard → Edge Functions → Secrets):
//   LINE_GROUP_ID             — target group (starts with "C")
//   NOTIFY_SECRET             — same value as vault secret 'line_notify_secret'
//   For the channel token, EITHER (preferred — no LINE Developers Console needed):
//     LINE_CHANNEL_ID         — Messaging API channel ID
//     LINE_CHANNEL_SECRET     — Messaging API channel secret
//   OR (legacy): LINE_CHANNEL_ACCESS_TOKEN — long-lived token from the console

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v3/token';

// Resolve a channel access token. Prefer minting a short-lived stateless token
// from the channel ID + secret — this works even when the channel sits under a
// LINE Developers provider we can't open in the console. Falls back to a
// long-lived token if one is configured instead.
const getAccessToken = async (): Promise<string | null> => {
  const id = Deno.env.get('LINE_CHANNEL_ID');
  const secret = Deno.env.get('LINE_CHANNEL_SECRET');
  if (id && secret) {
    const res = await fetch(LINE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: id,
        client_secret: secret,
      }),
    });
    if (res.ok) {
      const { access_token } = await res.json();
      return access_token;
    }
    console.error('Failed to mint stateless token:', res.status, await res.text());
    return null;
  }
  return Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? null;
};

interface JobRecord {
  job_id: string;
  customer_name: string;
  event_name?: string;
  event_date?: string;
  total_price: number;
  created_by?: string;
  item_count?: number;
}

interface StockItem {
  name: string;
  remaining_qty: number;
  unit?: string;
  min_alert?: number;
}

interface StockSummary {
  total: number;
  normal: number;
  low: number;
  out: number;
  attention: StockItem[];
  more_count: number;
}

interface OverdueJob {
  job_id: string;
  customer_name: string;
  event_name?: string;
  event_date?: string;
  days_overdue: number;
}

interface OverdueSummary {
  count: number;
  jobs: OverdueJob[];
  more_count: number;
}

const baht = (n: number) => Number(n ?? 0).toLocaleString('th-TH');

const thaiDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('th-TH', { dateStyle: 'long' }) : null;

const thaiShortDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-';

const buildStockMessage = (s: StockSummary): string => {
  const lines = [
    '📦 สรุปสต็อกประจำสัปดาห์',
    `วัสดุทั้งหมด: ${s.total} รายการ`,
    `🟢 ปกติ: ${s.normal}`,
    `🟡 ใกล้หมด: ${s.low}`,
    `🔴 หมด: ${s.out}`,
  ];
  if (s.attention?.length) {
    lines.push('', '⚠️ ต้องสั่งซื้อ:');
    for (const m of s.attention) {
      lines.push(
        Number(m.remaining_qty) <= 0
          ? `🔴 ${m.name} — หมด`
          : `🟡 ${m.name} — เหลือ ${baht(m.remaining_qty)} ${m.unit ?? ''} (เกณฑ์ ${baht(m.min_alert ?? 0)})`,
      );
    }
    if (s.more_count > 0) {
      lines.push(`...และอีก ${s.more_count} รายการ`);
    }
  } else {
    lines.push('', '✅ สต็อกปกติทุกรายการ');
  }
  return lines.join('\n');
};

const buildOverdueMessage = (s: OverdueSummary): string | null => {
  if (!s?.jobs?.length) return null;
  const lines = [`🔴 งานเลยกำหนดส่งแล้วยังไม่เสร็จ (${s.count} งาน)`, ''];
  for (const j of s.jobs) {
    lines.push(`• ${j.job_id} — ${j.customer_name}${j.event_name ? ` (${j.event_name})` : ''}`);
    lines.push(`  กำหนด ${thaiShortDate(j.event_date)} · เลย ${j.days_overdue} วัน`);
  }
  if (s.more_count > 0) {
    lines.push('', `...และอีก ${s.more_count} งาน`);
  }
  return lines.join('\n');
};

const buildMessage = (event: string, record: unknown): string | null => {
  if (event === 'stock_summary') {
    return buildStockMessage(record as StockSummary);
  }
  if (event === 'overdue_jobs') {
    return buildOverdueMessage(record as OverdueSummary);
  }
  const r = record as JobRecord;
  if (event === 'new_order') {
    return [
      '🆕 มีใบสั่งงานใหม่',
      `เลขที่: ${r.job_id}`,
      `ลูกค้า: ${r.customer_name}`,
      r.event_name ? `งาน: ${r.event_name}` : null,
      r.event_date ? `วันที่จัดงาน: ${thaiDate(r.event_date)}` : null,
      `รายการ: ${r.item_count ?? '-'} รายการ`,
      `ยอดรวม: ${baht(r.total_price)} บาท`,
      r.created_by ? `ผู้สั่ง: ${r.created_by}` : null,
    ].filter(Boolean).join('\n');
  }
  if (event === 'job_completed') {
    return [
      '✅ งานเสร็จแล้ว',
      `เลขที่: ${r.job_id}`,
      `ลูกค้า: ${r.customer_name}`,
      r.event_name ? `งาน: ${r.event_name}` : null,
      `ยอดรวม: ${baht(r.total_price)} บาท`,
    ].filter(Boolean).join('\n');
  }
  return null;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Diagnostic: report the LINE monthly push quota limit and current consumption.
  // Auth with x-notify-secret (same as the main route). Returns no secrets.
  if (url.pathname.endsWith('/quota')) {
    const expected = Deno.env.get('NOTIFY_SECRET');
    if (!expected || req.headers.get('x-notify-secret') !== expected) {
      return new Response('Unauthorized', { status: 401 });
    }
    const token = await getAccessToken();
    if (!token) return new Response('Not configured', { status: 500 });
    const h = { Authorization: `Bearer ${token}` };
    const [q, c] = await Promise.all([
      fetch('https://api.line.me/v2/bot/message/quota', { headers: h }),
      fetch('https://api.line.me/v2/bot/message/quota/consumption', { headers: h }),
    ]);
    const body = { quota: await q.json(), consumption: await c.json() };
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helper webhook target: log LINE event sources so the group ID can be read
  // from the function logs. Safe to leave deployed; it only logs and replies 200.
  if (url.pathname.endsWith('/find-group-id')) {
    try {
      const body = await req.json();
      const sources = (body.events ?? []).map((e: { source?: unknown }) => e.source);
      console.log('LINE webhook sources:', JSON.stringify(sources));

      // Best-effort persist so the group ID can also be read with a SQL query
      const sbUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (sbUrl && serviceKey && sources.length) {
        await fetch(`${sbUrl}/rest/v1/line_webhook_sources`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(sources.map((source: unknown) => ({ source }))),
        });
      }
    } catch (_) {
      // LINE's verify request has no JSON body
    }
    return new Response('ok');
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const expected = Deno.env.get('NOTIFY_SECRET');
  if (!expected || req.headers.get('x-notify-secret') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = await getAccessToken();
  const groupId = Deno.env.get('LINE_GROUP_ID');
  if (!token || !groupId) {
    console.error('Missing LINE channel credentials or LINE_GROUP_ID secret');
    return new Response('Not configured', { status: 500 });
  }

  const { event, record } = await req.json();
  const text = buildMessage(event, record);
  if (!text) {
    return new Response('Ignored', { status: 200 });
  }

  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to: groupId, messages: [{ type: 'text', text }] }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('LINE push failed:', res.status, detail);
    return new Response(`LINE push failed: ${res.status} ${detail}`, { status: 502 });
  }

  return new Response('Sent', { status: 200 });
});
