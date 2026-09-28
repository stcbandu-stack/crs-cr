-- Setup for the "ออกเอกสารแล้ว" (document printed) mark on job orders
-- (Already applied to the live project via MCP migrations on 2026-09-28 —
--  kept here for reference / re-creating the project from scratch)
--
-- Manual toggle, admin-only in the UI (History page). null = not printed yet.
-- Does not touch `status`, so the LINE notify triggers on job_orders don't fire.

alter table public.job_orders
  add column if not exists printed_at timestamptz;
