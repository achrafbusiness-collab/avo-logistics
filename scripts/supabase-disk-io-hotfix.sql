-- AVO Logistics: Supabase Disk IO hotfix
-- Run in Supabase SQL Editor (production) during low-traffic time.
-- Safe to run multiple times.

-- 1) Indexes for common RLS + query patterns
create index if not exists idx_profiles_company_id
on public.profiles (company_id);

create index if not exists idx_profiles_role_company_id
on public.profiles (role, company_id);

create index if not exists idx_drivers_lower_email
on public.drivers (lower(email));

create index if not exists idx_drivers_company_status_created
on public.drivers (company_id, status, created_date desc);

create index if not exists idx_checklists_company_created_desc
on public.checklists (company_id, created_date desc);

create index if not exists idx_order_segments_company_created_desc
on public.order_segments (company_id, created_date desc);

create index if not exists idx_order_segments_company_price_status_created_desc
on public.order_segments (company_id, price_status, created_date desc);

create index if not exists idx_order_notes_company_created_at_desc
on public.order_notes (company_id, created_at desc);

create index if not exists idx_app_settings_company_created_desc
on public.app_settings (company_id, created_date desc);

create index if not exists idx_customers_company_status_created
on public.customers (company_id, status, created_date desc);

-- 2) Evaluate current company lookup once per statement in policies
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with jwt as (
    select nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'email'), '') as email
  )
  select coalesce(
    (select p.company_id from public.profiles p where p.id = auth.uid()),
    (
      select d.company_id
      from public.drivers d, jwt
      where jwt.email is not null
        and lower(d.email) = lower(jwt.email)
      limit 1
    )
  )
$$;

-- 3) RLS policy tuning via initPlan pattern: (select public.current_company_id())
alter policy "Orders company access" on public.orders
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Drivers company access" on public.drivers
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Customers company access" on public.customers
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Checklists company access" on public.checklists
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Order handoffs company access" on public.order_handoffs
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Order segments company access" on public.order_segments
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "App settings company access" on public.app_settings
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Order notes company access" on public.order_notes
using (company_id = (select public.current_company_id()))
with check (company_id = (select public.current_company_id()));

alter policy "Audit logs select" on public.audit_logs
using (company_id = (select public.current_company_id()));

alter policy "Audit logs insert" on public.audit_logs
with check (company_id = (select public.current_company_id()));

drop policy if exists "Documents access" on storage.objects;
create policy "Documents access" on storage.objects
for all using (
  bucket_id = 'documents'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = (select public.current_company_id())
)
with check (
  bucket_id = 'documents'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = (select public.current_company_id())
);

drop policy if exists "Employee IDs access" on storage.objects;
create policy "Employee IDs access" on storage.objects
for all using (
  bucket_id = 'employee-ids'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = (select public.current_company_id())
)
with check (
  bucket_id = 'employee-ids'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = (select public.current_company_id())
);

-- 4) Refresh planner stats after index/policy updates
analyze public.profiles;
analyze public.orders;
analyze public.drivers;
analyze public.customers;
analyze public.checklists;
analyze public.order_handoffs;
analyze public.order_segments;
analyze public.order_notes;
analyze public.app_settings;
analyze public.audit_logs;
