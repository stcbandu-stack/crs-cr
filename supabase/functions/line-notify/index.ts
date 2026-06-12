// LINE group notifications for job orders.
//
// Routes:
//   POST /line-notify                — called by the DB trigger (private.notify_line)
//                                      auth: x-notify-secret header (NOTIFY_SECRET)
//   POST /line-notify/find-group-id  — set temporarily as the LINE webhook URL to
//                                      discover the group ID from function logs
//
// Required Edge Function secrets (Dashboard → Edge Functions → Secrets):
//   LINE_CHANNEL_ACCESS_TOKEN — long-lived token from LINE Developers Console
//   LINE_GROUP_ID             — target group (starts with "C")
//   NOTIFY_SECRET             — same value as vault secret 'line_notify_secret'

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

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

const baht = (n: number) => Number(n ?? 0).toLocaleString('th-TH');

const thaiDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('th-TH', { dateStyle: 'long' }) : null;

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

const buildMessage = (event: string, record: unknown): string | null => {
  if (event === 'stock_summary') {
    return buildStockMessage(record as StockSummary);
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

  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const groupId = Deno.env.get('LINE_GROUP_ID');
  if (!token || !groupId) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID secret');
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
    console.error('LINE push failed:', res.status, await res.text());
    return new Response('LINE push failed', { status: 502 });
  }

  return new Response('Sent', { status: 200 });
});
