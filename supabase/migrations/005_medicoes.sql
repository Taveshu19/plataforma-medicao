create type measurement_status as enum (
  'RASCUNHO', 'EM_ANALISE', 'DEVOLVIDA', 'APROVADA',
  'NF_ENVIADA', 'NF_APROVADA', 'PAGA', 'CANCELADA'
);

create table measurement_periods (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  competence date not null,
  opens_at   timestamptz not null,
  closes_at  timestamptz not null,
  created_at timestamptz not null default now(),
  unique (project_id, competence),
  check (closes_at > opens_at)
);

create table measurements (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  period_id     uuid not null references measurement_periods(id) on delete cascade,
  contract_id   uuid not null references contracts(id) on delete cascade,
  status        measurement_status not null default 'RASCUNHO',
  current_level int not null default 0,
  protocol      text unique,
  submitted_at  timestamptz,
  version       int not null default 1,
  created_at    timestamptz not null default now()
);

-- uma medicao viva por contrato/periodo; cancelada libera o par
create unique index measurements_one_active
  on measurements (period_id, contract_id)
  where status <> 'CANCELADA';

create table measurement_items (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  measurement_id   uuid not null references measurements(id) on delete cascade,
  contract_item_id uuid not null references contract_items(id) on delete cascade,
  qty_requested    numeric(14,4) not null check (qty_requested > 0),
  qty_approved     numeric(14,4) check (qty_approved >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  unique (measurement_id, contract_item_id)
);

create index measurement_items_item_idx on measurement_items (contract_item_id);

create or replace function next_protocol(p_measurement_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_competence date;
  v_project    uuid;
  v_seq        int;
begin
  select p.competence, p.project_id
    into v_competence, v_project
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  if v_competence is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  select count(*) + 1 into v_seq
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where p.project_id = v_project
    and p.competence = v_competence
    and m.protocol is not null;

  return 'MED-' || to_char(v_competence, 'YYYY-MM') || '-' || lpad(v_seq::text, 3, '0');
end $$;

alter table measurement_periods enable row level security;
alter table measurements        enable row level security;
alter table measurement_items   enable row level security;

create policy periods_select on measurement_periods for select
  using (project_id in (select auth_project_ids()));

create policy measurements_select on measurements for select
  using (can_read_contract(contract_id));

create policy measurement_items_select on measurement_items for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));
