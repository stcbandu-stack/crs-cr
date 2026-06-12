-- Setup for LINE group notifications (new orders + jobs marked completed)
-- (Already applied to the live project via MCP migrations on 2026-06-12 —
--  kept here for reference / re-creating the project from scratch)
--
-- Companion edge function: supabase/functions/line-notify/index.ts
-- Required edge function secrets (Dashboard → Edge Functions → Secrets):
--   LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID, NOTIFY_SECRET

-- 0. Shared secret between the DB trigger and the edge function.
--    Generate a random value; it must match the NOTIFY_SECRET edge function secret.
--    (Run separately — never commit the real value.)
-- select vault.create_secret('<random-secret>', 'line_notify_secret',
--   'Shared secret between DB trigger and line-notify edge function');

-- 1. Async HTTP from Postgres
create extension if not exists pg_net;

-- 2. Private schema so the security definer function is not exposed via the Data API
create schema if not exists private;

-- 3. Trigger function: posts the job payload to the line-notify edge function.
--    Async (after commit) — HTTP failures never block the insert/update.
create or replace function private.notify_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'line_notify_secret';

  if secret is null then
    raise warning 'line_notify_secret not found in vault; skipping LINE notification';
    return new;
  end if;

  perform net.http_post(
    url := 'https://crogaiqfxaaydpfmoqbc.supabase.co/functions/v1/line-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', secret
    ),
    body := jsonb_build_object(
      'event', case when tg_op = 'INSERT' then 'new_order' else 'job_completed' end,
      'record', jsonb_build_object(
        'job_id', new.job_id,
        'customer_name', new.customer_name,
        'event_name', new.event_name,
        'event_date', new.event_date,
        'total_price', new.total_price,
        'created_by', new.created_by,
        'item_count', coalesce(jsonb_array_length(new.items), 0)
      )
    )
  );
  return new;
end;
$$;

revoke all on function private.notify_line() from public;

-- 4. Triggers: every new order, and only the transition INTO 'completed'
drop trigger if exists trg_line_notify_new_order on public.job_orders;
create trigger trg_line_notify_new_order
  after insert on public.job_orders
  for each row
  execute function private.notify_line();

drop trigger if exists trg_line_notify_completed on public.job_orders;
create trigger trg_line_notify_completed
  after update of status on public.job_orders
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function private.notify_line();
