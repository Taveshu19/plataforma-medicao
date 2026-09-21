create type measurement_unit as enum (
  'm2', 'm3', 'ml', 'un', 'pt', 'vb', 'kg', 'ton', 'h', 'diaria', 'pct'
);

create table contracts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  number        text not null,
  description   text,
  starts_on     date,
  ends_on       date,
  created_at    timestamptz not null default now(),
  unique (project_id, number)
);

create table contract_addendums (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  number      text not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (contract_id, number)
);

create table contract_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  contract_id   uuid not null references contracts(id) on delete cascade,
  addendum_id   uuid references contract_addendums(id),
  unit_id       uuid references units(id),
  service_name  text not null,
  service_group text,
  unit          measurement_unit not null,
  quantity      numeric(14,4) not null check (quantity > 0),
  unit_price    numeric(14,4) not null check (unit_price >= 0),
  created_at    timestamptz not null default now()
);

create index contract_items_contract_idx on contract_items (contract_id);
create index contract_items_unit_idx     on contract_items (unit_id);

create or replace function auth_contractor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select contractor_id from memberships
  where user_id = auth.uid() and contractor_id is not null
$$;

/* Um usuario e "empreiteiro" quando tem ao menos um vinculo com contractor_id.
   Empreiteiro so alcanca os proprios contratos; os demais papeis alcancam
   todos os contratos das obras que enxergam. */
create or replace function can_read_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from contracts c
    where c.id = p_contract_id
      and c.project_id in (select auth_project_ids())
      and (
        not exists (select 1 from memberships m
                    where m.user_id = auth.uid() and m.contractor_id is not null)
        or c.contractor_id in (select auth_contractor_ids())
      )
  )
$$;

alter table contracts          enable row level security;
alter table contract_addendums enable row level security;
alter table contract_items     enable row level security;

create policy contracts_select on contracts for select
  using (can_read_contract(id));

create policy contract_addendums_select on contract_addendums for select
  using (can_read_contract(contract_id));

create policy contract_items_select on contract_items for select
  using (can_read_contract(contract_id));

/* Modo de digitacao padrao da construtora. O empreiteiro pode alternar
   por linha, mas a tela abre no modo que a obra definir. */
create type input_mode as enum ('quantidade', 'percentual');

alter table projects add column measurement_input_mode input_mode not null default 'quantidade';

/* Percentual e SEMPRE relativo a quantidade do item daquele local,
   nunca ao total do contrato. Contrato com 2.000 m2 de alvenaria e
   pavimento com 200 m2: 10% sao 20 m2, nao 200. */
create or replace function qty_from_percent(p_item_id uuid, p_percent numeric)
returns numeric
language sql
stable
as $$
  select round(ci.quantity * p_percent / 100.0, 4)
  from contract_items ci where ci.id = p_item_id
$$;

create or replace function percent_from_qty(p_item_id uuid, p_qty numeric)
returns numeric
language sql
stable
as $$
  select round(p_qty * 100.0 / ci.quantity, 4)
  from contract_items ci where ci.id = p_item_id
$$;
