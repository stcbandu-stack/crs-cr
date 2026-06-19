-- Setup for daily LINE digest of overdue jobs (every day 08:00 Asia/Bangkok)
-- (Already applied to the live project via MCP migrations on 2026-06-17 —
--  kept here for reference / re-creating the project from scratch)
--
-- Companion edge function: supabase/functions/line-notify/index.ts (event 'overdue_jobs')
-- Depends on: vault secret 'line_notify_secret' (see line-notify-setup.sql)
--
-- Overdue rule: event_date strictly before "today" in Asia/Bangkok AND the job
-- is not yet finished (status not in 'completed', 'cancelled'). The digest
-- repeats every day until each job is completed/cancelled. Stays silent on days
-- with nothing overdue.

create extension if not exists pg_cron;

create or replace function private.notify_overdue_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  today_th date := (now() at time zone 'Asia/Bangkok')::date;
  payload jsonb;
  overdue_total bigint;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'line_notify_secret';

  if secret is null then
    raise warning 'line_notify_secret not found in vault; skipping overdue jobs notification';
    return;
  end if;

  select count(*) into overdue_total
  from public.job_orders
  where event_date is not null
    and event_date < today_th
    and coalesce(status, '') not in ('completed', 'cancelled');

  -- Nothing overdue today: stay quiet.
  if overdue_total = 0 then
    return;
  end if;

  select jsonb_build_object(
    'count', overdue_total,
    'jobs', coalesce((
      select jsonb_agg(item)
      from (
        select jsonb_build_object(
          'job_id', job_id,
          'customer_name', customer_name,
          'event_name', event_name,
          'event_date', event_date,
          'days_overdue', (today_th - event_date)
        ) as item
        from public.job_orders
        where event_date is not null
          and event_date < today_th
          and coalesce(status, '') not in ('completed', 'cancelled')
        order by event_date asc, job_id asc
        limit 20
      ) t
    ), '[]'::jsonb),
    'more_count', greatest(0, overdue_total - 20)
  )
  into payload;

  perform net.http_post(
    url := 'https://crogaiqfxaaydpfmoqbc.supabase.co/functions/v1/line-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', secret
    ),
    body := jsonb_build_object('event', 'overdue_jobs', 'record', payload)
  );
end;
$$;

revoke all on function private.notify_overdue_jobs() from public;

-- 08:00 Asia/Bangkok = 01:00 UTC (pg_cron runs in UTC).
-- cron.schedule with an existing job name replaces that job (idempotent).
select cron.schedule(
  'line-overdue-jobs-daily',
  '0 1 * * *',
  $$select private.notify_overdue_jobs()$$
);
