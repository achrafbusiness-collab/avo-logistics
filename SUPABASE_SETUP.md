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
  must_reset_password boolean default false,
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
  review_checks jsonb default '{}'::jsonb,
  review_notes text,
  status_override_reason text,
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

create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders on delete cascade,
  company_id uuid references public.companies,
  author_user_id uuid,
  author_name text,
  author_email text,
  note text,
  is_pinned boolean default false,
  created_at timestamptz default now()
);

alter table public.order_notes enable row level security;

create policy "Order notes company access" on public.order_notes
for all using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

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
add column if not exists dropoff_postal_code text,
add column if not exists review_checks jsonb default '{}'::jsonb,
add column if not exists review_notes text,
add column if not exists status_override_reason text;

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

## 7) Mandantenfähigkeit (Pflicht)

Ziel: **Kein Datensatz ohne Unternehmens‑Zuordnung (`company_id`)**.

### 7a) Unternehmenstabelle + erstes Unternehmen (AVO LOGISTICS)

```sql
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vat_id text,
  billing_address text,
  billing_city text,
  billing_postal_code text,
  billing_country text,
  contact_name text,
  contact_email text,
  contact_phone text,
  is_active boolean default true,
  owner_user_id uuid references auth.users on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Wenn companies schon existiert, fehlende Spalten hinzufügen:
alter table public.companies
  add column if not exists vat_id text,
  add column if not exists billing_address text,
  add column if not exists billing_city text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_country text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists is_active boolean default true;

-- Erstes Unternehmen anlegen (ersetze die E-Mail)
insert into public.companies (name, owner_user_id)
values (
  'AVO LOGISTICS',
  (select id from auth.users where email = 'ADMIN_EMAIL_HIER')
)
on conflict do nothing
returning id;
```

Merke dir die `id` (company_id). Diese brauchst du für die Backfills unten.

### 7b) `company_id` in allen Tabellen + Backfill

```sql
alter table public.profiles
add column if not exists company_id uuid references public.companies;

alter table public.profiles
add column if not exists must_reset_password boolean default false;

alter table public.orders add column if not exists company_id uuid references public.companies;
alter table public.drivers add column if not exists company_id uuid references public.companies;
alter table public.customers add column if not exists company_id uuid references public.companies;
alter table public.checklists add column if not exists company_id uuid references public.companies;
alter table public.app_settings add column if not exists company_id uuid references public.companies;
alter table public.order_notes add column if not exists company_id uuid references public.companies;

-- Backfill: alle bestehenden Daten dem AVO‑Unternehmen zuordnen
update public.profiles set company_id = 'COMPANY_ID_HIER' where company_id is null;
update public.profiles set must_reset_password = false where must_reset_password is null;
update public.orders set company_id = 'COMPANY_ID_HIER' where company_id is null;
update public.drivers set company_id = 'COMPANY_ID_HIER' where company_id is null;
update public.customers set company_id = 'COMPANY_ID_HIER' where company_id is null;
update public.checklists set company_id = 'COMPANY_ID_HIER' where company_id is null;
update public.app_settings set company_id = 'COMPANY_ID_HIER' where company_id is null;
update public.order_notes set company_id = 'COMPANY_ID_HIER' where company_id is null;

alter table public.profiles alter column company_id set not null;
alter table public.orders alter column company_id set not null;
alter table public.drivers alter column company_id set not null;
alter table public.customers alter column company_id set not null;
alter table public.checklists alter column company_id set not null;
alter table public.app_settings alter column company_id set not null;
alter table public.order_notes alter column company_id set not null;
```

### 7c) Auto‑Zuordnung bei INSERT (wenn `company_id` fehlt)

```sql
create or replace function public.current_company_id()
returns uuid
language sql
stable
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.set_company_id()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  if new.company_id is null then
    raise exception 'company_id missing';
  end if;
  return new;
end;
$$;

drop trigger if exists set_company_id_orders on public.orders;
create trigger set_company_id_orders before insert on public.orders
for each row execute procedure public.set_company_id();

drop trigger if exists set_company_id_drivers on public.drivers;
create trigger set_company_id_drivers before insert on public.drivers
for each row execute procedure public.set_company_id();

drop trigger if exists set_company_id_customers on public.customers;
create trigger set_company_id_customers before insert on public.customers
for each row execute procedure public.set_company_id();

drop trigger if exists set_company_id_checklists on public.checklists;
create trigger set_company_id_checklists before insert on public.checklists
for each row execute procedure public.set_company_id();

drop trigger if exists set_company_id_app_settings on public.app_settings;
create trigger set_company_id_app_settings before insert on public.app_settings
for each row execute procedure public.set_company_id();

drop trigger if exists set_company_id_order_notes on public.order_notes;
create trigger set_company_id_order_notes before insert on public.order_notes
for each row execute procedure public.set_company_id();
```

### 7d) Profile‑Trigger anpassen (company_id aus Invite übernehmen)

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role, permissions, company_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'minijobber',
    '{}'::jsonb,
    (new.raw_user_meta_data->>'company_id')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

### 7e) RLS‑Policies auf `company_id` beschränken

```sql
-- Alte Policies entfernen
drop policy if exists "Orders full access" on public.orders;
drop policy if exists "Drivers full access" on public.drivers;
drop policy if exists "Customers full access" on public.customers;
drop policy if exists "Checklists full access" on public.checklists;
drop policy if exists "App settings full access" on public.app_settings;

create policy "Orders company access" on public.orders
for all using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "Drivers company access" on public.drivers
for all using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "Customers company access" on public.customers
for all using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "Checklists company access" on public.checklists
for all using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

create policy "App settings company access" on public.app_settings
for all using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- Profiles: eigener Datensatz + Admin derselben Firma
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

create policy "Profiles read own or company admin" on public.profiles
for select using (
  auth.uid() = id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.company_id = profiles.company_id
  )
);

create policy "Profiles update own or company admin" on public.profiles
for update using (
  auth.uid() = id
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.company_id = profiles.company_id
  )
);
```

### 7f) Storage‑Policies mit company_id (Dokumente/Uploads)

```sql
drop policy if exists "Documents access" on storage.objects;
drop policy if exists "Employee IDs access" on storage.objects;

create policy "Documents access" on storage.objects
for all using (
  bucket_id = 'documents'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = public.current_company_id()
)
with check (
  bucket_id = 'documents'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = public.current_company_id()
);

create policy "Employee IDs access" on storage.objects
for all using (
  bucket_id = 'employee-ids'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = public.current_company_id()
)
with check (
  bucket_id = 'employee-ids'
  and auth.uid() is not null
  and (metadata->>'company_id')::uuid = public.current_company_id()
);
```

Optional: Bestehende Storage‑Dateien dem AVO‑Unternehmen zuordnen:

```sql
update storage.objects
set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{company_id}', to_jsonb('COMPANY_ID_HIER'))
where bucket_id in ('documents', 'employee-ids')
  and (metadata->>'company_id') is null;
```

### 7g) Audit‑Log (Verlauf)

```sql
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies,
  actor_user_id uuid,
  actor_email text,
  action text,
  entity text,
  entity_id uuid,
  description text,
  changes jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "Audit logs select" on public.audit_logs;
create policy "Audit logs select" on public.audit_logs
for select using (company_id = public.current_company_id());

drop policy if exists "Audit logs insert" on public.audit_logs;
create policy "Audit logs insert" on public.audit_logs
for insert with check (company_id = public.current_company_id());

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor uuid;
  v_actor_email text;
  v_action text;
  v_entity text := TG_TABLE_NAME;
  v_entity_id uuid;
  v_changes jsonb;
begin
  v_actor := auth.uid();

  if TG_OP = 'INSERT' then
    v_action := 'create';
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_changes := jsonb_build_object('new', to_jsonb(NEW));
  elsif TG_OP = 'UPDATE' then
    v_action := 'update';
    v_company_id := NEW.company_id;
    v_entity_id := NEW.id;
    v_changes := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
    v_company_id := OLD.company_id;
    v_entity_id := OLD.id;
    v_changes := jsonb_build_object('old', to_jsonb(OLD));
  end if;

  if v_actor is not null then
    select email into v_actor_email from public.profiles where id = v_actor;
  end if;

  insert into public.audit_logs (
    company_id,
    actor_user_id,
    actor_email,
    action,
    entity,
    entity_id,
    changes
  ) values (
    v_company_id,
    v_actor,
    v_actor_email,
    v_action,
    v_entity,
    v_entity_id,
    v_changes
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_orders on public.orders;
create trigger audit_orders
after insert or update or delete on public.orders
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_drivers on public.drivers;
create trigger audit_drivers
after insert or update or delete on public.drivers
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_customers on public.customers;
create trigger audit_customers
after insert or update or delete on public.customers
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_checklists on public.checklists;
create trigger audit_checklists
after insert or update or delete on public.checklists
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
after insert or update or delete on public.profiles
for each row execute procedure public.write_audit_log();

drop trigger if exists audit_order_notes on public.order_notes;
create trigger audit_order_notes
after insert or update or delete on public.order_notes
for each row execute procedure public.write_audit_log();

create or replace function public.write_storage_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_actor uuid;
  v_actor_email text;
  v_action text;
  v_entity_id uuid;
  v_changes jsonb;
begin
  v_actor := auth.uid();

  if TG_OP = 'INSERT' then
    v_action := 'upload';
    v_company_id := (NEW.metadata->>'company_id')::uuid;
    v_entity_id := NEW.id;
    v_changes := jsonb_build_object('bucket', NEW.bucket_id, 'name', NEW.name);
  elsif TG_OP = 'DELETE' then
    v_action := 'delete';
    v_company_id := (OLD.metadata->>'company_id')::uuid;
    v_entity_id := OLD.id;
    v_changes := jsonb_build_object('bucket', OLD.bucket_id, 'name', OLD.name);
  else
    return coalesce(NEW, OLD);
  end if;

  if v_company_id is null then
    return coalesce(NEW, OLD);
  end if;

  if v_actor is not null then
    select email into v_actor_email from public.profiles where id = v_actor;
  end if;

  insert into public.audit_logs (
    company_id,
    actor_user_id,
    actor_email,
    action,
    entity,
    entity_id,
    changes
  ) values (
    v_company_id,
    v_actor,
    v_actor_email,
    v_action,
    'storage',
    v_entity_id,
    v_changes
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_storage on storage.objects;
create trigger audit_storage
after insert or delete on storage.objects
for each row execute procedure public.write_storage_audit_log();
```
