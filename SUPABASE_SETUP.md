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
