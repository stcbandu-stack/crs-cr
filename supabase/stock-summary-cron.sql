-- Setup for weekly stock summary to LINE (every Friday 10:00 Asia/Bangkok)
-- (Already applied to the live project via MCP migrations on 2026-06-12 —
--  kept here for reference / re-creating the project from scratch)
--
-- Companion edge function: supabase/functions/line-notify/index.ts (event 'stock_summary')
-- Depends on: vault secret 'line_notify_secret' (see line-notify-setup.sql)
--
-- Counting rules mirror the in-app dashboard (useInventoryDashboard.ts):
--   out    = remaining_qty <= 0
--   low    = remaining_qty > 0 and <= min_alert
--   normal = remaining_qty > min_alert
-- Only non-deleted materials are counted.

create extension if not exists pg_cron;

create or replace function private.notify_stock_summary()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  payload jsonb;
  attention_total bigint;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'line_notify_secret';

  if secret is null then
    raise warning 'line_notify_secret not found in vault; skipping stock summary';
    return;
  end if;

  select count(*) into attention_total
  from public.materials
  where coalesce(is_deleted, false) = false
    and remaining_qty <= min_alert;

  select jsonb_build_object(
    'total', count(*),
    'normal', count(*) filter (where remaining_qty > min_alert),
    'low', count(*) filter (where remaining_qty > 0 and remaining_qty <= min_alert),
    'out', count(*) filter (where remaining_qty <= 0),
    'attention', coalesce((
      select jsonb_agg(item)
      from (
        select jsonb_build_object(
          'name', name,
          'remaining_qty', remaining_qty,
          'unit', unit,
          'min_alert', min_alert
        ) as item
        from public.materials
        where coalesce(is_deleted, false) = false
          and remaining_qty <= min_alert
        order by remaining_qty asc, name asc
        limit 20
      ) t
    ), '[]'::jsonb),
    'more_count', greatest(0, attention_total - 20)
  )
  into payload
  from public.materials
  where coalesce(is_deleted, false) = false;

  perform net.http_post(
    url := 'https://crogaiqfxaaydpfmoqbc.supabase.co/functions/v1/line-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', secret
    ),
    body := jsonb_build_object('event', 'stock_summary', 'record', payload)
  );
end;
$$;

revoke all on function private.notify_stock_summary() from public;

-- Friday 10:00 Asia/Bangkok = 03:00 UTC (pg_cron runs in UTC).
-- cron.schedule with an existing job name replaces that job (idempotent).
select cron.schedule(
  'line-stock-summary-friday',
  '0 3 * * 5',
  $$select private.notify_stock_summary()$$
);
