-- Setup for the per-job production Drive link (ลิงก์ไดรฟ์สำหรับผลิตงาน)
-- (Already applied to the live project via MCP migrations on 2026-06-17 —
--  kept here for reference / re-creating the project from scratch)
--
-- One link per job order. Managed from the History page (🔗 ลิงก์ button)
-- and shown on the JobDetail toolbar (hidden when printing — internal use only).

alter table public.job_orders
  add column if not exists drive_url text;
