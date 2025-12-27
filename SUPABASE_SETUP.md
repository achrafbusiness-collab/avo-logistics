# Supabase Setup

## 1) Auth Redirect URLs

In Supabase -> Authentication -> URL Configuration:
- Site URL: `https://avo-logistics.app`
- Additional Redirect URLs:
  - `https://avo-logistics.app/reset-password`
  - `https://*.vercel.app/reset-password`
  - `http://localhost:5173/reset-password`

## 2) Create `profiles` table + RLS

Run this in Supabase SQL Editor:

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  role text default 'minijobber',
  position text,
  employment_type text,
  address text,
  phone text,
  id_front_url text,
  id_back_url text,
  permissions jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role, permissions)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'minijobber',
    '{}'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Admins can read all profiles"
on public.profiles for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "Admins can update all profiles"
on public.profiles for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
```

## 2b) Optional: Freigabe-Pflicht (Empfohlen)

Wenn neue Konten erst freigegeben werden sollen, setze Standard auf `false`:

```sql
alter table public.profiles
alter column is_active set default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role, permissions, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'minijobber',
    '{}'::jsonb,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

## 3) Set your first Admin

After you sign up your own account, run:

```sql
update public.profiles
set role = 'admin',
    permissions = '{"Dashboard":true,"Orders":true,"Drivers":true,"Customers":true,"Checklists":true,"Search":true,"AIImport":true,"AVOAI":true,"AppConnection":true,"TeamAVO":true}'::jsonb
where email = 'DEINE_EMAIL';
```

## 3b) Optional: Ausweis-Dokumente nachrüsten (falls Tabelle schon existiert)

```sql
alter table public.profiles
add column if not exists id_front_url text,
add column if not exists id_back_url text;
```

## 3c) Storage Bucket für Ausweise

In Supabase -> Storage:
- Bucket erstellen: `employee-ids`
- Sichtbarkeit: **public** (einfachste Variante, damit die Vorschau funktioniert)

## 4) Environment Variables

Vercel -> Project -> Settings -> Environment Variables:
- `VITE_SUPABASE_URL` = your Supabase URL
- `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
- `SUPABASE_URL` = your Supabase URL (server)
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key (server)
- `OPENAI_API_KEY` = your OpenAI key

Local `.env.local` (do not commit):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 4b) Eigene Absender-E-Mail (SMTP)

Damit Einladungen von **deiner E-Mail** kommen:
Supabase -> Authentication -> SMTP Settings:
- SMTP aktivieren
- From Name / From Address auf deine Domain (z.B. `noreply@avo-logistics.app`)
- SPF/DKIM Records bei deinem Domain-Provider setzen (Supabase zeigt dir die Werte)

## 5) App-Datenbanken (Orders, Drivers, Customers, Checklists, AppSettings)

Run this in Supabase SQL Editor:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text,
  status text,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  assigned_driver_id uuid,
  assigned_driver_name text,
  license_plate text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  vin text,
  pickup_address text,
  pickup_city text,
  pickup_postal_code text,
  pickup_date date,
  pickup_time text,
  dropoff_address text,
  dropoff_city text,
  dropoff_postal_code text,
  dropoff_date date,
  dropoff_time text,
  notes text,
  price numeric,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

-- Interne Auftragsnummern automatisch vergeben (AVO-YYYY-xxxxx)
create sequence if not exists public.order_number_seq;

create or replace function public.generate_order_number()
returns text
language plpgsql
as $$
declare
  seq bigint;
  year text;
begin
  year := to_char(now(), 'YYYY');
  seq := nextval('public.order_number_seq');
  return 'AVO-' || year || '-' || lpad(seq::text, 5, '0');
end;
$$;

create or replace function public.set_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null or btrim(new.order_number) = '' then
    new.order_number := public.generate_order_number();
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_number on public.orders;
create trigger set_order_number
before insert on public.orders
for each row execute procedure public.set_order_number();

update public.orders
set order_number = public.generate_order_number()
where order_number is null or order_number = '';

alter table public.orders
alter column order_number set not null;

create unique index if not exists orders_order_number_unique
on public.orders(order_number);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  phone text,
  address text,
  city text,
  postal_code text,
  country text,
  nationality text,
  status text default 'active',
  license_front text,
  license_back text,
  id_card_front text,
  id_card_back text,
  license_expiry date,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_number text,
  type text,
  company_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  address text,
  city text,
  postal_code text,
  country text,
  tax_id text,
  price_per_km numeric,
  base_price numeric,
  notes text,
  status text default 'active',
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  order_number text,
  driver_id uuid,
  driver_name text,
  type text,
  datetime timestamptz,
  location text,
  kilometer numeric,
  fuel_level text,
  cleanliness_inside text,
  cleanliness_outside text,
  accessories jsonb default '{}'::jsonb,
  mandatory_checks jsonb default '{}'::jsonb,
  damages jsonb default '[]'::jsonb,
  photos jsonb default '[]'::jsonb,
  notes text,
  signature_driver text,
  signature_customer text,
  customer_name text,
  completed boolean default false,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  support_phone text,
  support_email text,
  emergency_phone text,
  office_address text,
  office_hours text,
  app_version text,
  instructions text,
  legal_text text,
  delivery_legal_text text,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

alter table public.orders enable row level security;
alter table public.drivers enable row level security;
alter table public.customers enable row level security;
alter table public.checklists enable row level security;
alter table public.app_settings enable row level security;

create policy "Orders full access" on public.orders
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Drivers full access" on public.drivers
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Customers full access" on public.customers
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Checklists full access" on public.checklists
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "App settings full access" on public.app_settings
for all using (auth.uid() is not null) with check (auth.uid() is not null);
```

Wenn Tabellen schon existieren, füge die PLZ-Spalten hinzu:

```sql
alter table public.orders
add column if not exists pickup_postal_code text,
add column if not exists dropoff_postal_code text;

alter table public.checklists
add column if not exists mandatory_checks jsonb default '{}'::jsonb;
```

## 6) Storage Buckets (Dokumente & Fotos)

Einmal in Supabase SQL Editor:

```sql
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('employee-ids', 'employee-ids', true)
on conflict (id) do nothing;

create policy "Documents access" on storage.objects
for all using (bucket_id = 'documents' and auth.uid() is not null)
with check (bucket_id = 'documents' and auth.uid() is not null);

create policy "Employee IDs access" on storage.objects
for all using (bucket_id = 'employee-ids' and auth.uid() is not null)
with check (bucket_id = 'employee-ids' and auth.uid() is not null);
```
