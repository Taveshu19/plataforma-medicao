create extension if not exists pgcrypto;

create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  phone      text,
  created_at timestamptz not null default now()
);

create type app_role as enum (
  'admin', 'engenharia', 'coordenacao', 'gerencia',
  'financeiro', 'empreiteiro', 'incorporadora'
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role       app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role)
);

create index memberships_user_idx on memberships (user_id);

-- security definer para nao recursar na policy de memberships
create or replace function auth_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships where user_id = auth.uid()
$$;

alter table companies   enable row level security;
alter table profiles    enable row level security;
alter table memberships enable row level security;

create policy companies_select on companies for select
  using (id in (select auth_company_ids()));

create policy profiles_select_self on profiles for select
  using (id = auth.uid());

create policy memberships_select_own on memberships for select
  using (user_id = auth.uid());
