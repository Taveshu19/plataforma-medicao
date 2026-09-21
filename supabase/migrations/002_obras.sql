create table projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  unit_label      text not null default 'casa',
  approval_levels int  not null default 3 check (approval_levels between 1 and 5),
  created_at      timestamptz not null default now()
);

create table contractors (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  document   text,
  created_at timestamptz not null default now()
);

create table stages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  position   int  not null default 0
);

create table unit_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  area       numeric(14,4)
);

create table units (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  stage_id      uuid not null references stages(id) on delete cascade,
  unit_type_id  uuid references unit_types(id),
  name          text not null,
  position      int  not null default 0,
  unique (stage_id, name)
);

-- escopo por obra: null = acesso a toda a empresa
alter table memberships add column project_id    uuid references projects(id) on delete cascade;
alter table memberships add column contractor_id uuid references contractors(id) on delete cascade;

create or replace function auth_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from projects p
  join memberships m on m.company_id = p.company_id and m.user_id = auth.uid()
  where m.project_id is null or m.project_id = p.id
$$;

alter table projects    enable row level security;
alter table contractors enable row level security;
alter table stages      enable row level security;
alter table unit_types  enable row level security;
alter table units       enable row level security;

create policy projects_select on projects for select
  using (id in (select auth_project_ids()));

create policy contractors_select on contractors for select
  using (company_id in (select auth_company_ids()));

create policy stages_select on stages for select
  using (project_id in (select auth_project_ids()));

create policy unit_types_select on unit_types for select
  using (project_id in (select auth_project_ids()));

create policy units_select on units for select
  using (stage_id in (select id from stages where project_id in (select auth_project_ids())));
