-- Setup for customer claims (แจ้งเคลม) — quality-control tracking so claim
-- amounts can be used to decide staff penalties, plus LINE alerts and a
-- dedicated claims dashboard.
-- (Already applied to the live project via MCP migrations on 2026-08-08 —
--  kept here for reference / re-creating the project from scratch)
--
-- Internal-only feature (no customer-facing login exists): any staff account
-- files a claim on the customer's behalf from the JobDetail page. Filing is
-- deliberately minimal (type + description) — no employee attribution
-- required up front, and the claim amount is not typed in either: the
-- client sets it to the job's own total_price (the value at risk if the
-- claim is upheld), not an admin-entered figure. `responsible_name` is
-- filled in later (optionally) by whoever closes the case from the Claims
-- list, once it's actually known who's at fault. `responsible_name` /
-- `reported_by` are plain text snapshots (not FKs to profiles) — same
-- convention as job_orders.created_by/customer_name.

-- 1. Table
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.job_orders(job_id) on delete cascade,
  customer_name text not null,
  claim_type text not null default 'other', -- remake | fix | other
  claim_note text,
  description text not null,
  claim_amount numeric not null default 0, -- set client-side from job_orders.total_price
  responsible_name text, -- set at report time or later at resolve time; nullable
  reported_by text,
  status text not null default 'open', -- open | resolved
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.claims enable row level security;

-- Same permissive policy as every other table in this project (job_orders,
-- customers, profiles) — access control is enforced client-side via
-- src/store/auth.ts, not RLS.
create policy "Enable all access" on public.claims for all using (true) with check (true);

create index if not exists claims_job_id_idx on public.claims(job_id);
create index if not exists claims_created_at_idx on public.claims(created_at desc);
create index if not exists claims_status_idx on public.claims(status);

-- 2. LINE notification on every new claim — reuses the shared vault secret
--    'line_notify_secret' and the same edge function as job orders.
--    Companion edge function: supabase/functions/line-notify/index.ts (event 'new_claim')
create or replace function private.notify_line_claim()
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
      'event', 'new_claim',
      'record', jsonb_build_object(
        'job_id', new.job_id,
        'customer_name', new.customer_name,
        'claim_type', new.claim_type,
        'claim_amount', new.claim_amount,
        'description', new.description,
        'responsible_name', new.responsible_name
      )
    )
  );
  return new;
end;
$$;

revoke all on function private.notify_line_claim() from public;

drop trigger if exists trg_line_notify_new_claim on public.claims;
create trigger trg_line_notify_new_claim
  after insert on public.claims
  for each row
  execute function private.notify_line_claim();
