-- Setup for job order image attachments
-- (Already applied to the live project via MCP migrations on 2026-06-12 —
--  kept here for reference / re-creating the project from scratch)

-- 1. Add images column to job_orders
alter table job_orders
  add column if not exists images jsonb not null default '[]'::jsonb;

-- 2. Create a public storage bucket for job images
insert into storage.buckets (id, name, public)
values ('job-images', 'job-images', true)
on conflict (id) do nothing;

-- 3. Storage policies: logged-in users can upload/delete.
-- No SELECT policy needed: the bucket is public, so images are viewable
-- by URL, and omitting it prevents clients from listing all files.
create policy "job-images authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'job-images');

create policy "job-images authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'job-images');
