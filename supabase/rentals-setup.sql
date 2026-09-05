-- Setup for equipment rentals (ระบบเช่าทรัพย์สิน) — the shop rents out a small
-- fixed fleet of gear (cameras, drone, prize wheel, inflatable draw booth, claw
-- machine) to affiliated companies, priced per 24 hours.
--
-- Internal-only feature, same as claims: no customer-facing login exists, so a
-- staff member keys in the rental on the renter's behalf and ticks the
-- e-consent box after showing the contract. Acceptance evidence lives on the
-- rentals row (accepted_by_name + accepted_at + contract_version) — that is the
-- electronic record contemplated by พ.ร.บ.ธุรกรรมทางอิเล็กทรอนิกส์ ม.7-9.
-- Movable-property leases (ป.พ.พ. ม.537) have no statutory form requirement,
-- so no wet signature is needed. (Hire-purchase / เช่าซื้อ under ม.572 WOULD
-- require signatures — this is deliberately not that.)
--
-- Availability is derived, not stored: an asset is unavailable while a
-- rental_item covering it has returned_at IS NULL — indefinitely, even past the
-- agreed end_at. Keying the return (photos optional — staff discretion, not
-- every return can realistically be photographed) is what puts the asset back
-- in circulation.
--
-- `customer_name` / `created_by` / `returned_by` are plain text snapshots
-- (not FKs to customers/profiles) — same convention as job_orders and claims.

-- 1. Rentable assets
create table if not exists public.rental_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  daily_rate numeric not null default 0, -- ค่าเช่าต่อ 24 ชั่วโมง
  is_active boolean not null default true,
  last_condition_image text,   -- รูปสภาพล่าสุด = รูปตอนคืนครั้งหลังสุด
  last_condition_at timestamptz,
  created_at timestamptz not null default now()
);

-- 2. Rental agreements
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  rental_id text not null unique,
  customer_name text not null,
  event_name text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  billed_unit text not null default 'day',  -- day | hour
  billed_qty numeric not null default 0,    -- จำนวนวัน หรือ จำนวนชั่วโมง (ปัดขึ้นแล้ว)
  total_price numeric not null default 0,
  status text not null default 'active',    -- active | returned | cancelled
  note text,
  created_by text,
  contract_version text not null default 'v1',
  contract_html text,              -- snapshot สัญญาฉบับที่ยอมรับจริง (หลักฐาน)
  accepted_by_name text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 3. Line items — also the unit of return. One row per asset per rental.
create table if not exists public.rental_items (
  id uuid primary key default gen_random_uuid(),
  rental_id text not null references public.rentals(rental_id) on delete cascade,
  asset_id uuid not null references public.rental_assets(id),
  asset_name text not null,        -- snapshot
  daily_rate numeric not null,     -- snapshot ณ วันทำสัญญา
  line_total numeric not null default 0,
  handover_images jsonb not null default '[]'::jsonb, -- ตอนส่งมอบ (ไม่บังคับ)
  return_images jsonb not null default '[]'::jsonb,   -- ตอนคืน (ไม่บังคับ)
  returned_at timestamptz,         -- null = ยังไม่คืน = อุปกรณ์ยังถูกจองอยู่
  returned_by text,
  return_note text,
  created_at timestamptz not null default now()
);

alter table public.rental_assets enable row level security;
alter table public.rentals enable row level security;
alter table public.rental_items enable row level security;

-- Same permissive policy as every other table in this project — access control
-- is enforced client-side via src/store/auth.ts, not RLS.
create policy "Enable all access" on public.rental_assets for all using (true) with check (true);
create policy "Enable all access" on public.rentals for all using (true) with check (true);
create policy "Enable all access" on public.rental_items for all using (true) with check (true);

create index if not exists rentals_status_idx on public.rentals(status);
create index if not exists rentals_start_at_idx on public.rentals(start_at desc);
create index if not exists rental_items_rental_id_idx on public.rental_items(rental_id);
create index if not exists rental_items_asset_id_idx on public.rental_items(asset_id);
-- ตัวที่ยังไม่คืน คือชุดที่ต้องเช็กบ่อยที่สุดตอนหาของว่าง
create index if not exists rental_items_open_idx on public.rental_items(asset_id) where returned_at is null;

-- 4. Storage bucket for condition photos, mirroring job-images-setup.sql.
--    No SELECT policy: the bucket is public so images are viewable by URL, and
--    omitting it prevents clients from listing all files.
insert into storage.buckets (id, name, public)
values ('rental-images', 'rental-images', true)
on conflict (id) do nothing;

create policy "rental-images authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rental-images');

create policy "rental-images authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'rental-images');

-- 5. Seed the current fleet. Rates start at 0 — set them on /rentals/assets.
--    Note: renters are affiliated companies (related parties), so the rates
--    entered here should be defensible market rates per ป.รัษฎากร ม.65 ทวิ (4).
insert into public.rental_assets (name, daily_rate)
select * from (values
  ('กล้องถ่ายรูป', 0),
  ('กล้องวิดีโอ #1', 0),
  ('กล้องวิดีโอ #2', 0),
  ('โดรน', 0),
  ('วงล้อหมุนจับรางวัล', 0),
  ('ตู้จับฉลากแบบเป่าลม', 0),
  ('ตู้คีบตุ๊กตา', 0)
) as seed(name, daily_rate)
where not exists (select 1 from public.rental_assets);
