-- =========================================
-- MIGRATION: 001_tenancy.sql
-- =========================================

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


-- =========================================
-- MIGRATION: 002_obras.sql
-- =========================================

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


-- =========================================
-- MIGRATION: 003_contratos.sql
-- =========================================

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


-- =========================================
-- MIGRATION: 004_can_read_contract_por_empresa.sql
-- =========================================

/* Correcao: can_read_contract() checava "este usuario e empreiteiro?" de forma
   global ao usuario, sem escopar por empresa. Um usuario que e engenheiro na
   Construtora A (membership com contractor_id nulo) e tambem empreiteiro na
   Construtora B (membership com contractor_id preenchido) perdia acesso aos
   contratos da propria Construtora A, porque o "not exists" global enxergava
   o vinculo de empreiteiro da B e o "auth_contractor_ids() in" comparava com
   o contractor_id da B, que nunca bate com contratos da A.

   A correcao escopa as duas subconsultas por c.company_id: o usuario so e
   tratado como "empreiteiro" dentro da empresa do contrato sendo avaliado. */
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
        -- nesta empresa o usuario nao atua como empreiteiro: ve todos os contratos
        not exists (
          select 1 from memberships m
          where m.user_id = auth.uid()
            and m.company_id = c.company_id
            and m.contractor_id is not null
        )
        -- ou atua como empreiteiro nesta empresa, e o contrato e dele
        or exists (
          select 1 from memberships m
          where m.user_id = auth.uid()
            and m.company_id = c.company_id
            and m.contractor_id = c.contractor_id
        )
      )
  )
$$;


-- =========================================
-- MIGRATION: 005_medicoes.sql
-- =========================================

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


-- =========================================
-- MIGRATION: 006_saldo.sql
-- =========================================

/* Saldo de um item de contrato.
   Consomem saldo: EM_ANALISE, APROVADA, NF_ENVIADA, NF_APROVADA, PAGA.
   Nao consomem:   RASCUNHO, DEVOLVIDA, CANCELADA.
   Em medicao viva, vale o aprovado quando existir; senao, o solicitado. */
create or replace function contract_item_balance(
  p_item_id uuid,
  p_exclude_measurement uuid default null
)
returns numeric
language sql
stable
as $$
  select ci.quantity - coalesce((
    select sum(coalesce(mi.qty_approved, mi.qty_requested))
    from measurement_items mi
    join measurements m on m.id = mi.measurement_id
    where mi.contract_item_id = ci.id
      and m.status in ('EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA')
      and (p_exclude_measurement is null or m.id <> p_exclude_measurement)
  ), 0)
  from contract_items ci
  where ci.id = p_item_id
$$;

create or replace function enforce_item_balance()
returns trigger
language plpgsql
as $$
declare
  v_status  measurement_status;
  v_qty     numeric;
  v_balance numeric;
begin
  select status into v_status from measurements where id = new.measurement_id;

  -- medicao morta nao disputa saldo
  if v_status = 'CANCELADA' then
    return new;
  end if;

  v_qty     := coalesce(new.qty_approved, new.qty_requested);
  v_balance := contract_item_balance(new.contract_item_id, new.measurement_id);

  if v_qty > v_balance then
    raise exception
      'Quantidade superior ao saldo disponivel. O maximo permitido e %.',
      trim(trailing '.' from trim(trailing '0' from v_balance::text))
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger measurement_items_balance
  before insert or update of qty_requested, qty_approved on measurement_items
  for each row execute function enforce_item_balance();


-- =========================================
-- MIGRATION: 007_saldo_na_transicao.sql
-- =========================================

/* Correcoes de saldo encontradas na revisao da Task 6.
   Nenhuma migration anterior foi editada; esta camada substitui a funcao e
   o trigger de 006 via CREATE OR REPLACE / DROP+CREATE TRIGGER.

   1) FURO CRITICO: o trigger de 006 vive em measurement_items e so
      revalida o saldo quando um ITEM e inserido/alterado. Uma medicao
      podia ser criada como RASCUNHO (nao consome), receber itens ate o
      limite do contrato, e so DEPOIS ter seu status trocado para
      EM_ANALISE/APROVADA/etc via UPDATE em measurements.status -- update
      que nao toca measurement_items e portanto nao disparava nenhuma
      checagem. Duas medicoes assim, cada uma com a quantidade cheia do
      item, promovidas em sequencia, furavam o saldo sem passar por
      nenhum caminho bloqueado. Corrigido com um trigger novo em
      measurements, que revalida todos os itens da medicao quando ela
      entra numa lista de status que consome e nao vinha de uma.

   2) Corrida entre duas transacoes concorrentes: sem lock, duas sessoes
      inserindo/promovendo ao mesmo tempo nao se enxergam sob READ
      COMMITTED e as duas passam. Corrigido com
      `select ... for update` na linha do contract_item antes de
      calcular o saldo, em ambos os triggers -- serializa quem disputa o
      mesmo item.

   3) O trigger de measurement_items so disparava em
      `update of qty_requested, qty_approved`. Um UPDATE trocando
      contract_item_id (ou measurement_id) nao disparava a checagem.
      Corrigido removendo a lista de colunas: o trigger agora dispara em
      qualquer INSERT/UPDATE na linha.

   4) Nada validava que o contract_item pertence ao contrato da medicao.
      Corrigido com uma checagem explicita em enforce_item_balance().

   5) contract_item_balance() era invoker-rights lendo tabelas com RLS.
      Alinhado ao padrao de can_read_contract() (003): security definer
      + search_path fixo.

   6) Mensagem de erro: trim(trailing '0' ...) so funcionava por
      coincidencia de formatacao. Trocado por trim_scale(), que e
      garantido pelo tipo numeric. */

create or replace function contract_item_balance(
  p_item_id uuid,
  p_exclude_measurement uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select ci.quantity - coalesce((
    select sum(coalesce(mi.qty_approved, mi.qty_requested))
    from measurement_items mi
    join measurements m on m.id = mi.measurement_id
    where mi.contract_item_id = ci.id
      and m.status in ('EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA')
      and (p_exclude_measurement is null or m.id <> p_exclude_measurement)
  ), 0)
  from contract_items ci
  where ci.id = p_item_id
$$;

create or replace function enforce_item_balance()
returns trigger
language plpgsql
as $$
declare
  v_status        measurement_status;
  v_contract_id   uuid;
  v_item_contract uuid;
  v_service_name  text;
  v_qty           numeric;
  v_balance       numeric;
begin
  select status, contract_id into v_status, v_contract_id
  from measurements where id = new.measurement_id;

  -- trava a linha do item: serializa disputas concorrentes pelo mesmo
  -- saldo e nos da os dados do item para validar o contrato e compor a
  -- mensagem de erro.
  select contract_id, service_name into v_item_contract, v_service_name
  from contract_items
  where id = new.contract_item_id
  for update;

  if v_item_contract is distinct from v_contract_id then
    raise exception
      'O item medido nao pertence ao contrato desta medicao.'
      using errcode = 'foreign_key_violation';
  end if;

  -- medicao morta nao disputa saldo
  if v_status = 'CANCELADA' then
    return new;
  end if;

  v_qty     := coalesce(new.qty_approved, new.qty_requested);
  v_balance := contract_item_balance(new.contract_item_id, new.measurement_id);

  if v_qty > v_balance then
    raise exception
      'Quantidade acima do saldo disponivel para %. O maximo permitido e %.',
      v_service_name, trim_scale(v_balance)::text
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- dispara em qualquer insert/update na linha (item 3 da revisao): trocar
-- contract_item_id ou measurement_id tambem precisa revalidar o saldo.
drop trigger if exists measurement_items_balance on measurement_items;
create trigger measurement_items_balance
  before insert or update on measurement_items
  for each row execute function enforce_item_balance();

/* Revalida o saldo de TODOS os itens de uma medicao quando ela entra
   numa lista de status que consome saldo vindo de um status que nao
   consumia. Transicoes entre dois status que ja consomem (ex.:
   EM_ANALISE -> APROVADA) nao precisam de revalidacao: o consumo do
   item nao muda so por causa dessa transicao. */
create or replace function enforce_measurement_transition_balance()
returns trigger
language plpgsql
as $$
declare
  v_consuming measurement_status[] := array[
    'EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA'
  ];
  r record;
  v_qty     numeric;
  v_balance numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = any(v_consuming) and not (old.status = any(v_consuming)) then
    for r in
      select mi.contract_item_id, mi.qty_requested, mi.qty_approved, ci.service_name
      from measurement_items mi
      join contract_items ci on ci.id = mi.contract_item_id
      where mi.measurement_id = new.id
    loop
      -- mesma trava usada em enforce_item_balance: serializa transicoes
      -- concorrentes disputando o saldo do mesmo item.
      perform 1 from contract_items where id = r.contract_item_id for update;

      v_qty     := coalesce(r.qty_approved, r.qty_requested);
      v_balance := contract_item_balance(r.contract_item_id, new.id);

      if v_qty > v_balance then
        raise exception
          'Quantidade acima do saldo disponivel para %. O maximo permitido e %.',
          r.service_name, trim_scale(v_balance)::text
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  return new;
end $$;

drop trigger if exists measurements_balance_on_transition on measurements;
create trigger measurements_balance_on_transition
  before update of status on measurements
  for each row execute function enforce_measurement_transition_balance();


-- =========================================
-- MIGRATION: 008_fluxo.sql
-- =========================================

create table approval_levels (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  level      int not null check (level >= 1),
  label      text not null,
  role       app_role not null,
  unique (project_id, level)
);

alter table approval_levels enable row level security;

create policy approval_levels_select on approval_levels for select
  using (project_id in (select auth_project_ids()));

create or replace function submit_measurement(p_measurement_id uuid)
returns text
language plpgsql
as $$
declare
  v_status     measurement_status;
  v_protocol   text;
  v_items      int;
  v_project    uuid;
  v_competence date;
begin
  select status, protocol into v_status, v_protocol
  from measurements where id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Medicao nao pode ser enviada no status %.', v_status;
  end if;

  select count(*) into v_items
  from measurement_items where measurement_id = p_measurement_id;

  if v_items = 0 then
    raise exception 'Medicao sem nenhum item preenchido.';
  end if;

  -- lock consultivo por obra e competencia para serializar geracao concorrente de protocolo
  select p.project_id, p.competence
    into v_project, v_competence
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  perform pg_advisory_xact_lock(hashtext(v_project::text), hashtext(v_competence::text));

  -- protocolo nasce no primeiro envio e sobrevive a devolucoes
  if v_protocol is null then
    v_protocol := next_protocol(p_measurement_id);
  end if;

  update measurements
  set status        = 'EM_ANALISE',
      current_level = 1,
      protocol      = v_protocol,
      submitted_at  = coalesce(submitted_at, now()),
      version       = version + 1
  where id = p_measurement_id;

  return v_protocol;
end $$;

create or replace function approve_measurement(p_measurement_id uuid)
returns measurement_status
language plpgsql
as $$
declare
  v_status    measurement_status;
  v_level     int;
  v_max_level int;
  v_new       measurement_status;
begin
  select m.status, m.current_level into v_status, v_level
  from measurements m where m.id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Medicao nao esta em analise (status atual: %).', v_status;
  end if;

  select max(al.level) into v_max_level
  from approval_levels al
  join measurements m        on m.id = p_measurement_id
  join measurement_periods p on p.id = m.period_id
  where al.project_id = p.project_id;

  if v_max_level is null then
    raise exception 'Obra sem niveis de aprovacao configurados.';
  end if;

  if v_level >= v_max_level then
    v_new := 'APROVADA';
    update measurements set status = v_new, current_level = v_max_level,
                            version = version + 1
    where id = p_measurement_id;
  else
    v_new := 'EM_ANALISE';
    update measurements set current_level = v_level + 1, version = version + 1
    where id = p_measurement_id;
  end if;

  return v_new;
end $$;

create or replace function return_measurement(p_measurement_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_status measurement_status;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A devolucao exige um motivo.';
  end if;

  select status into v_status from measurements where id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Somente medicao em analise pode ser devolvida (status atual: %).', v_status;
  end if;

  update measurements
  set status = 'DEVOLVIDA', current_level = 0, version = version + 1
  where id = p_measurement_id;
end $$;


-- =========================================
-- MIGRATION: 009_auditoria.sql
-- =========================================

create table audit_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  measurement_id uuid references measurements(id) on delete cascade,
  actor_id       uuid,
  action         text not null,
  entity         text not null,
  entity_id      uuid,
  old_value      text,
  new_value      text,
  level          int,
  reason         text,
  created_at     timestamptz not null default clock_timestamp()
);

create index audit_log_measurement_idx on audit_log (measurement_id, created_at);

alter table audit_log enable row level security;

create policy audit_log_select on audit_log for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));

create or replace function log_item_adjustment()
returns trigger
language plpgsql
as $$
declare
  v_level int;
begin
  if new.qty_approved is not distinct from old.qty_approved then
    return new;
  end if;

  select current_level into v_level from measurements where id = new.measurement_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id,
     old_value, new_value, level)
  values
    (new.company_id, new.measurement_id, auth.uid(), 'QUANTIDADE_AJUSTADA',
     'measurement_item', new.id,
     coalesce(old.qty_approved, old.qty_requested)::text,
     new.qty_approved::text,
     v_level);

  return new;
end $$;

create trigger measurement_items_audit
  after update of qty_approved on measurement_items
  for each row execute function log_item_adjustment();

create or replace function log_measurement_change()
returns trigger
language plpgsql
as $$
declare
  v_action text;
begin
  if new.status is not distinct from old.status
     and new.current_level is not distinct from old.current_level then
    return new;
  end if;

  v_action := case
    when new.status = 'EM_ANALISE' and old.status in ('RASCUNHO', 'DEVOLVIDA') then 'ENVIADA'
    when new.status = 'DEVOLVIDA'  then 'DEVOLVIDA'
    when new.status = 'CANCELADA'  then 'CANCELADA'
    when new.status = 'EM_ANALISE' and new.current_level > old.current_level then 'APROVADA'
    when new.status = 'APROVADA'   then 'APROVADA'
    else 'STATUS_ALTERADO'
  end;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id,
     old_value, new_value, level)
  values
    (new.company_id, new.id, auth.uid(), v_action, 'measurement', new.id,
     old.status::text, new.status::text, old.current_level);

  return new;
end $$;

create trigger measurements_audit
  after update of status, current_level on measurements
  for each row execute function log_measurement_change();

/* A devolucao precisa gravar o motivo, que o trigger generico nao enxerga. */
create or replace function return_measurement(p_measurement_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_status measurement_status;
  v_company uuid;
  v_level  int;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A devolucao exige um motivo.';
  end if;

  select status, company_id, current_level
    into v_status, v_company, v_level
  from measurements where id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Somente medicao em analise pode ser devolvida (status atual: %).', v_status;
  end if;

  update measurements
  set status = 'DEVOLVIDA', current_level = 0, version = version + 1
  where id = p_measurement_id;

  update audit_log
  set reason = p_reason
  where id = (
    select id from audit_log
    where measurement_id = p_measurement_id and action = 'DEVOLVIDA'
    order by created_at desc limit 1
  );
end $$;


-- =========================================
-- MIGRATION: 010_reabertura.sql
-- =========================================

create table period_reopenings (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  period_id      uuid not null references measurement_periods(id) on delete cascade,
  contractor_id  uuid not null references contractors(id) on delete cascade,
  reopened_until timestamptz not null,
  authorized_by  uuid,
  reason         text not null,
  created_at     timestamptz not null default now()
);

create index period_reopenings_lookup
  on period_reopenings (period_id, contractor_id, reopened_until);

alter table period_reopenings enable row level security;

create policy period_reopenings_select on period_reopenings for select
  using (period_id in (select id from measurement_periods
                       where project_id in (select auth_project_ids())));

create or replace function is_period_open(p_period_id uuid, p_contractor_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from measurement_periods
    where id = p_period_id and now() between opens_at and closes_at
  )
  or exists (
    select 1 from period_reopenings
    where period_id = p_period_id
      and contractor_id = p_contractor_id
      and reopened_until > now()
  )
$$;

create or replace function reopen_period(
  p_period_id     uuid,
  p_contractor_id uuid,
  p_until         timestamptz,
  p_reason        text
)
returns uuid
language plpgsql
as $$
declare
  v_company uuid;
  v_id      uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reabertura exige um motivo.';
  end if;

  if p_until <= now() then
    raise exception 'A reabertura precisa de uma data futura.';
  end if;

  select company_id into v_company from measurement_periods where id = p_period_id;
  if v_company is null then
    raise exception 'Periodo nao encontrado.';
  end if;

  insert into period_reopenings
    (company_id, period_id, contractor_id, reopened_until, authorized_by, reason)
  values (v_company, p_period_id, p_contractor_id, p_until, auth.uid(), p_reason)
  returning id into v_id;

  return v_id;
end $$;

/* Rascunho e devolvida so mudam com periodo aberto.
   Medicao ja enviada nao volta a ser editada pelo empreiteiro. */
create or replace function enforce_period_open()
returns trigger
language plpgsql
as $$
declare
  v_status       measurement_status;
  v_period       uuid;
  v_contractor   uuid;
begin
  select m.status, m.period_id, c.contractor_id
    into v_status, v_period, v_contractor
  from measurements m
  join contracts c on c.id = m.contract_id
  where m.id = new.measurement_id;

  -- ajuste do aprovador acontece com a medicao em analise, fora da janela
  if v_status in ('EM_ANALISE') then
    return new;
  end if;

  if v_status in ('APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA') then
    raise exception 'Medicao ja aprovada nao pode ser alterada.';
  end if;

  if not is_period_open(v_period, v_contractor) then
    raise exception 'O periodo de medicao esta encerrado.';
  end if;

  return new;
end $$;

create trigger measurement_items_period
  before insert or update of qty_requested on measurement_items
  for each row execute function enforce_period_open();


-- =========================================
-- MIGRATION: 011_anexos_nf.sql
-- =========================================

alter table projects add column invoice_tolerance numeric(14,4) not null default 0;

create table attachments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  measurement_id      uuid references measurements(id) on delete cascade,
  measurement_item_id uuid references measurement_items(id) on delete cascade,
  bucket              text not null,
  path                text not null unique,
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes > 0),
  created_at          timestamptz not null default now()
);

create type invoice_status as enum ('RECEBIDA', 'EM_CONFERENCIA', 'APROVADA', 'REJEITADA', 'PAGA');

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  measurement_id uuid not null references measurements(id) on delete cascade,
  number         text not null,
  issued_on      date not null,
  amount         numeric(14,4) not null check (amount > 0),
  status         invoice_status not null default 'RECEBIDA',
  pdf_path       text,
  xml_path       text,
  created_at     timestamptz not null default now(),
  unique (measurement_id, number)
);

alter table attachments enable row level security;
alter table invoices    enable row level security;

create policy attachments_select on attachments for select
  using (
    (measurement_id is not null and measurement_id in (select id from measurements where can_read_contract(contract_id)))
    or
    (measurement_item_id is not null and measurement_item_id in (
      select mi.id from measurement_items mi
      join measurements m on m.id = mi.measurement_id
      where can_read_contract(m.contract_id)
    ))
  );

create policy invoices_select on invoices for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));

/* p_approved = true soma o aprovado; false soma o solicitado. */
create or replace function measurement_total(p_measurement_id uuid, p_approved boolean)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case when p_approved then coalesce(mi.qty_approved, 0) else mi.qty_requested end
    * ci.unit_price
  ), 0)
  from measurement_items mi
  join contract_items ci on ci.id = mi.contract_item_id
  where mi.measurement_id = p_measurement_id
$$;

create or replace function submit_invoice(
  p_measurement_id uuid,
  p_number         text,
  p_issued_on      date,
  p_amount         numeric,
  p_pdf            text,
  p_xml            text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    measurement_status;
  v_company   uuid;
  v_approved  numeric;
  v_tolerance numeric;
  v_id        uuid;
begin
  select m.status, m.company_id, p.invoice_tolerance
    into v_status, v_company, v_tolerance
  from measurements m
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status <> 'APROVADA' then
    raise exception 'A nota fiscal so pode ser enviada para medicao aprovada (status atual: %).',
      v_status;
  end if;

  v_approved := measurement_total(p_measurement_id, true);

  if abs(p_amount - v_approved) > v_tolerance then
    raise exception
      'Valor da nota (%) diverge do valor aprovado (%). Diferenca aceita: %.',
      p_amount, v_approved, v_tolerance
      using errcode = 'check_violation';
  end if;

  insert into invoices
    (company_id, measurement_id, number, issued_on, amount, pdf_path, xml_path)
  values
    (v_company, p_measurement_id, p_number, p_issued_on, p_amount, p_pdf, p_xml)
  returning id into v_id;

  update measurements
  set status = 'NF_ENVIADA', version = version + 1
  where id = p_measurement_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, p_measurement_id, auth.uid(), 'NF_ENVIADA', 'invoice', v_id, p_amount::text);

  return v_id;
end $$;


-- =========================================
-- MIGRATION: 012_buckets.sql
-- =========================================

insert into storage.buckets (id, name, public)
values ('medicao-fotos', 'medicao-fotos', false),
       ('notas-fiscais', 'notas-fiscais', false),
       ('contratos-docs', 'contratos-docs', false)
on conflict (id) do nothing;

/* O primeiro segmento do caminho e sempre o company_id.
   Assim a RLS de storage reusa o mesmo isolamento das tabelas. */
create policy storage_select_own_company on storage.objects for select
  using (
    bucket_id in ('medicao-fotos', 'notas-fiscais', 'contratos-docs')
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );

create policy storage_insert_own_company on storage.objects for insert
  with check (
    bucket_id in ('medicao-fotos', 'notas-fiscais', 'contratos-docs')
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );


-- =========================================
-- MIGRATION: 013_resumo_contrato.sql
-- =========================================

/* Os quatro numeros da home do empreiteiro.
   Espelha a regra de saldo da migration 006, mas em valor em vez de quantidade:
   consomem APROVADA/NF_ENVIADA/NF_APROVADA/PAGA (como aprovado) e EM_ANALISE
   (como em aprovacao). RASCUNHO, DEVOLVIDA e CANCELADA nao entram.
   Em medicao viva vale o aprovado quando existir; senao, o solicitado. */
create or replace function contract_summary(p_contract_id uuid)
returns table (
  contracted numeric,
  approved   numeric,
  in_review  numeric,
  available  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with itens as (
    select id, quantity * unit_price as valor
    from contract_items
    where contract_id = p_contract_id
  ),
  consumo as (
    select
      coalesce(sum(
        case when m.status in ('APROVADA','NF_ENVIADA','NF_APROVADA','PAGA')
             then coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price
             else 0 end
      ), 0) as aprovado,
      coalesce(sum(
        case when m.status = 'EM_ANALISE'
             then coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price
             else 0 end
      ), 0) as em_analise
    from measurement_items mi
    join measurements m  on m.id = mi.measurement_id
    join contract_items ci on ci.id = mi.contract_item_id
    where ci.contract_id = p_contract_id
  )
  select
    coalesce((select sum(valor) from itens), 0)                                  as contracted,
    consumo.aprovado                                                              as approved,
    consumo.em_analise                                                            as in_review,
    coalesce((select sum(valor) from itens), 0) - consumo.aprovado - consumo.em_analise
                                                                                  as available
  from consumo
$$;


-- =========================================
-- MIGRATION: 014_medicao_escrita.sql
-- =========================================

/* Policies de escrita para measurements e measurement_items,
   submit_measurement com security definer e triggers de integridade como security definer. */

-- 1. Triggers de integridade como security definer para permitir row lock (FOR UPDATE) sem violar RLS
create or replace function enforce_item_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status        measurement_status;
  v_contract_id   uuid;
  v_item_contract uuid;
  v_service_name  text;
  v_qty           numeric;
  v_balance       numeric;
begin
  select status, contract_id into v_status, v_contract_id
  from measurements where id = new.measurement_id;

  select contract_id, service_name into v_item_contract, v_service_name
  from contract_items
  where id = new.contract_item_id
  for update;

  if v_item_contract is distinct from v_contract_id then
    raise exception
      'O item medido nao pertence ao contrato desta medicao.'
      using errcode = 'foreign_key_violation';
  end if;

  if v_status = 'CANCELADA' then
    return new;
  end if;

  v_qty     := coalesce(new.qty_approved, new.qty_requested);
  v_balance := contract_item_balance(new.contract_item_id, new.measurement_id);

  if v_qty > v_balance then
    raise exception
      'Quantidade acima do saldo disponivel para %. O maximo permitido e %.',
      v_service_name, trim_scale(v_balance)::text
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create or replace function enforce_measurement_transition_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consuming measurement_status[] := array[
    'EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA'
  ];
  r record;
  v_qty     numeric;
  v_balance numeric;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = any(v_consuming) and not (old.status = any(v_consuming)) then
    for r in
      select mi.contract_item_id, mi.qty_requested, mi.qty_approved, ci.service_name
      from measurement_items mi
      join contract_items ci on ci.id = mi.contract_item_id
      where mi.measurement_id = new.id
    loop
      perform 1 from contract_items where id = r.contract_item_id for update;

      v_qty     := coalesce(r.qty_approved, r.qty_requested);
      v_balance := contract_item_balance(r.contract_item_id, new.id);

      if v_qty > v_balance then
        raise exception
          'Quantidade acima do saldo disponivel para %. O maximo permitido e %.',
          r.service_name, trim_scale(v_balance)::text
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  return new;
end $$;

create or replace function enforce_period_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status       measurement_status;
  v_period       uuid;
  v_contractor   uuid;
begin
  select m.status, m.period_id, c.contractor_id
    into v_status, v_period, v_contractor
  from measurements m
  join contracts c on c.id = m.contract_id
  where m.id = new.measurement_id;

  if v_status in ('EM_ANALISE') then
    return new;
  end if;

  if v_status in ('APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA') then
    raise exception 'Medicao ja aprovada nao pode ser alterada.';
  end if;

  if not is_period_open(v_period, v_contractor) then
    raise exception 'O periodo de medicao esta encerrado.';
  end if;

  return new;
end $$;

-- 2. Policies em measurements
create policy measurements_insert on measurements for insert
  with check (
    can_read_contract(contract_id)
    and status = 'RASCUNHO'
    and current_level = 0
    and exists (
      select 1 from contracts c
      where c.id = contract_id
        and c.company_id = measurements.company_id
        and is_period_open(measurements.period_id, c.contractor_id)
    )
  );

create policy measurements_update on measurements for update
  using (
    can_read_contract(contract_id)
    and status in ('RASCUNHO', 'DEVOLVIDA')
    and exists (
      select 1 from contracts c
      where c.id = contract_id
        and is_period_open(measurements.period_id, c.contractor_id)
    )
  )
  with check (
    can_read_contract(contract_id)
    and status in ('RASCUNHO', 'DEVOLVIDA')
    and exists (
      select 1 from contracts c
      where c.id = contract_id
        and is_period_open(measurements.period_id, c.contractor_id)
    )
  );

create policy measurements_delete on measurements for delete
  using (
    can_read_contract(contract_id)
    and status = 'RASCUNHO'
    and exists (
      select 1 from contracts c
      where c.id = contract_id
        and is_period_open(measurements.period_id, c.contractor_id)
    )
  );

-- 3. Policies em measurement_items
create policy measurement_items_insert on measurement_items for insert
  with check (
    exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      join contract_items ci on ci.id = measurement_items.contract_item_id
      where m.id = measurement_items.measurement_id
        and ci.contract_id = m.contract_id
        and m.company_id = measurement_items.company_id
        and m.status in ('RASCUNHO', 'DEVOLVIDA')
        and can_read_contract(m.contract_id)
        and is_period_open(m.period_id, c.contractor_id)
    )
  );

create policy measurement_items_update on measurement_items for update
  using (
    exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      where m.id = measurement_items.measurement_id
        and m.status in ('RASCUNHO', 'DEVOLVIDA')
        and can_read_contract(m.contract_id)
        and is_period_open(m.period_id, c.contractor_id)
    )
  )
  with check (
    exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      where m.id = measurement_items.measurement_id
        and m.status in ('RASCUNHO', 'DEVOLVIDA')
        and can_read_contract(m.contract_id)
        and is_period_open(m.period_id, c.contractor_id)
    )
  );

create policy measurement_items_delete on measurement_items for delete
  using (
    exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      where m.id = measurement_items.measurement_id
        and m.status in ('RASCUNHO', 'DEVOLVIDA')
        and can_read_contract(m.contract_id)
        and is_period_open(m.period_id, c.contractor_id)
    )
  );

-- 4. Protecao contra alteracao indevida de qty_approved por empreiteiro
create or replace function protect_measurement_items_approved()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from memberships
    where user_id = auth.uid() and contractor_id is not null
  ) then
    if new.qty_approved is distinct from old.qty_approved then
      raise exception 'Empreiteiro nao pode alterar a quantidade aprovada.';
    end if;
  end if;
  return new;
end $$;

create trigger tr_protect_measurement_items_approved
  before update of qty_approved on measurement_items
  for each row execute function protect_measurement_items_approved();

-- 5. submit_measurement com security definer
create or replace function submit_measurement(p_measurement_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status     measurement_status;
  v_protocol   text;
  v_items      int;
  v_project    uuid;
  v_competence date;
  v_contract   uuid;
  v_period     uuid;
  v_contractor uuid;
begin
  select status, protocol, contract_id, period_id
    into v_status, v_protocol, v_contract, v_period
  from measurements where id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada para enviar esta medicao.';
  end if;

  select contractor_id into v_contractor from contracts where id = v_contract;
  if auth.uid() is not null and not is_period_open(v_period, v_contractor) then
    raise exception 'O periodo de medicao esta encerrado.';
  end if;


  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Medicao nao pode ser enviada no status %.', v_status;
  end if;

  select count(*) into v_items
  from measurement_items where measurement_id = p_measurement_id;

  if v_items = 0 then
    raise exception 'Medicao sem nenhum item preenchido.';
  end if;

  -- lock consultivo por obra e competencia para serializar geracao concorrente de protocolo
  select p.project_id, p.competence
    into v_project, v_competence
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  perform pg_advisory_xact_lock(hashtext(v_project::text), hashtext(v_competence::text));

  -- protocolo nasce no primeiro envio e sobrevive a devolucoes
  if v_protocol is null then
    v_protocol := next_protocol(p_measurement_id);
  end if;

  update measurements
  set status        = 'EM_ANALISE',
      current_level = 1,
      protocol      = v_protocol,
      submitted_at  = coalesce(submitted_at, now()),
      version       = version + 1
  where id = p_measurement_id;

  return v_protocol;
end $$;


-- =========================================
-- MIGRATION: 015_consulta_medicao.sql
-- =========================================

/* Funcoes SQL de apoio para navegacao e preenchimento da medicao:
   - get_or_create_draft: busca rascunho existente ou cria novo
   - get_measurement_stages_and_units: lista etapas e locais com contagem de itens e valores
   - get_unit_services_for_measurement: lista servicos de um local com saldo e quantidade medida
   - get_measurement_review: lista consolidada de itens medidos para revisao antes do envio */

create or replace function get_or_create_draft(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id    uuid;
  v_project_id    uuid;
  v_contractor_id uuid;
  v_period_id     uuid;
  v_meas_id       uuid;
  v_status        measurement_status;
  v_protocol      text;
begin
  select company_id, project_id, contractor_id
    into v_company_id, v_project_id, v_contractor_id
  from contracts
  where id = p_contract_id;

  if v_company_id is null then
    raise exception 'Contrato nao encontrado.';
  end if;

  if not can_read_contract(p_contract_id) then
    raise exception 'Permissao negada para este contrato.';
  end if;

  -- Localiza periodo aberto corrente
  select p.id into v_period_id
  from measurement_periods p
  where p.project_id = v_project_id
    and is_period_open(p.id, v_contractor_id)
  order by p.competence desc
  limit 1;

  if v_period_id is null then
    return jsonb_build_object('error', 'Sem periodo de medicao aberto.');
  end if;

  -- Verifica se ja existe medicao viva para o contrato no periodo
  select id, status, protocol
    into v_meas_id, v_status, v_protocol
  from measurements
  where period_id = v_period_id
    and contract_id = p_contract_id
    and status <> 'CANCELADA'
  limit 1;

  if v_meas_id is not null then
    return jsonb_build_object(
      'id', v_meas_id,
      'status', v_status,
      'protocol', v_protocol,
      'period_id', v_period_id
    );
  end if;

  -- Se nao existir, cria um novo rascunho
  insert into measurements (company_id, period_id, contract_id, status, current_level)
  values (v_company_id, v_period_id, p_contract_id, 'RASCUNHO', 0)
  returning id, status, protocol into v_meas_id, v_status, v_protocol;

  return jsonb_build_object(
    'id', v_meas_id,
    'status', v_status,
    'protocol', v_protocol,
    'period_id', v_period_id
  );
end $$;

create or replace function get_measurement_stages_and_units(p_measurement_id uuid)
returns table (
  stage_id         uuid,
  stage_name       text,
  stage_position   int,
  unit_id          uuid,
  unit_name        text,
  unit_position    int,
  total_items      bigint,
  measured_items   bigint,
  total_contracted numeric,
  total_measured   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with med as (
    select m.id, m.contract_id
    from measurements m
    where m.id = p_measurement_id
      and can_read_contract(m.contract_id)
  ),
  itens as (
    select
      ci.unit_id,
      ci.id as contract_item_id,
      ci.quantity * ci.unit_price as item_total,
      coalesce(mi.qty_requested, 0) as qty_req,
      coalesce(mi.qty_requested, 0) * ci.unit_price as measured_total
    from contract_items ci
    join med on med.contract_id = ci.contract_id
    left join measurement_items mi
      on mi.contract_item_id = ci.id and mi.measurement_id = med.id
    where ci.unit_id is not null
  )
  select
    s.id as stage_id,
    s.name as stage_name,
    s.position as stage_position,
    u.id as unit_id,
    u.name as unit_name,
    u.position as unit_position,
    count(distinct i.contract_item_id)::bigint as total_items,
    count(distinct case when i.qty_req > 0 then i.contract_item_id end)::bigint as measured_items,
    coalesce(sum(i.item_total), 0) as total_contracted,
    coalesce(sum(i.measured_total), 0) as total_measured
  from units u
  join stages s on s.id = u.stage_id
  join itens i on i.unit_id = u.id
  group by s.id, s.name, s.position, u.id, u.name, u.position
  order by s.position, s.name, u.position, u.name;
$$;

create or replace function get_unit_services_for_measurement(
  p_measurement_id uuid,
  p_unit_id uuid
)
returns table (
  contract_item_id uuid,
  service_name     text,
  service_group    text,
  unit             text,
  quantity         numeric,
  unit_price       numeric,
  balance          numeric,
  measured_qty     numeric,
  subtotal         numeric,
  notes            text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ci.id as contract_item_id,
    ci.service_name,
    ci.service_group,
    ci.unit::text,
    ci.quantity,
    ci.unit_price,
    contract_item_balance(ci.id, p_measurement_id) as balance,
    coalesce(mi.qty_requested, 0) as measured_qty,
    coalesce(mi.qty_requested, 0) * ci.unit_price as subtotal,
    mi.notes
  from contract_items ci
  join measurements m on m.id = p_measurement_id and m.contract_id = ci.contract_id
  left join measurement_items mi
    on mi.contract_item_id = ci.id and mi.measurement_id = p_measurement_id
  where ci.unit_id = p_unit_id
    and can_read_contract(m.contract_id)
  order by ci.service_group nulls first, ci.service_name;
$$;

create or replace function get_measurement_review(p_measurement_id uuid)
returns table (
  measurement_item_id uuid,
  contract_item_id    uuid,
  stage_name          text,
  unit_name           text,
  service_name        text,
  service_group       text,
  unit                text,
  unit_price          numeric,
  qty_requested       numeric,
  subtotal            numeric,
  notes               text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    mi.id as measurement_item_id,
    ci.id as contract_item_id,
    coalesce(s.name, 'Geral') as stage_name,
    coalesce(u.name, 'Geral') as unit_name,
    ci.service_name,
    ci.service_group,
    ci.unit::text,
    ci.unit_price,
    mi.qty_requested,
    mi.qty_requested * ci.unit_price as subtotal,
    mi.notes
  from measurement_items mi
  join measurements m on m.id = mi.measurement_id
  join contract_items ci on ci.id = mi.contract_item_id
  left join units u on u.id = ci.unit_id
  left join stages s on s.id = u.stage_id
  where mi.measurement_id = p_measurement_id
    and can_read_contract(m.contract_id)
    and mi.qty_requested > 0
  order by s.position nulls first, u.position nulls first, ci.service_name;
$$;


-- =========================================
-- MIGRATION: 016_salvar_medicao_itens.sql
-- =========================================

/* Salva itens de medicao atomicamente (upsert para qty > 0, delete para qty <= 0). */

create or replace function save_measurement_items(
  p_measurement_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id  uuid;
  v_contract_id uuid;
  v_status      measurement_status;
  elem          jsonb;
  v_item_id     uuid;
  v_qty         numeric;
  v_notes       text;
begin
  select company_id, contract_id, status
    into v_company_id, v_contract_id, v_status
  from measurements
  where id = p_measurement_id;

  if v_company_id is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Medicao nao pode ser alterada no status %.', v_status;
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract_id) then
    raise exception 'Permissao negada.';
  end if;

  for elem in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (elem->>'contract_item_id')::uuid;
    v_qty     := (elem->>'qty_requested')::numeric;
    v_notes   := elem->>'notes';

    if v_qty is null or v_qty <= 0 then
      delete from measurement_items
      where measurement_id = p_measurement_id
        and contract_item_id = v_item_id;
    else
      insert into measurement_items (
        company_id,
        measurement_id,
        contract_item_id,
        qty_requested,
        notes
      )
      values (
        v_company_id,
        p_measurement_id,
        v_item_id,
        v_qty,
        v_notes
      )
      on conflict (measurement_id, contract_item_id)
      do update set
        qty_requested = excluded.qty_requested,
        notes         = excluded.notes;
    end if;
  end loop;
end $$;


-- =========================================
-- MIGRATION: 017_proximo_protocolo_resiliente.sql
-- =========================================

/* Atualiza next_protocol para usar max() do sequencial em vez de count(),
   evitando colisoes caso sequenciais existam previamente ou tenham sido atribuidos. */

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

  select coalesce(max(substring(m.protocol from '(\d+)$')::int), 0) + 1 into v_seq
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where p.project_id = v_project
    and p.competence = v_competence
    and m.protocol is not null;

  return 'MED-' || to_char(v_competence, 'YYYY-MM') || '-' || lpad(v_seq::text, 3, '0');
end $$;


-- =========================================
-- MIGRATION: 018_analise_aprovacao.sql
-- =========================================

/* Funções seguras de análise, ajuste de quantidades aprovadas, aprovação e devolução da medição. */

-- 1. Aprovação de medição com validação de cargo por nível
create or replace function approve_measurement(p_measurement_id uuid)
returns measurement_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status        measurement_status;
  v_level         int;
  v_max_level     int;
  v_new           measurement_status;
  v_project_id    uuid;
  v_company_id    uuid;
  v_expected_role app_role;
begin
  select m.status, m.current_level, p.project_id, m.company_id
    into v_status, v_level, v_project_id, v_company_id
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Medicao nao esta em analise (status atual: %).', v_status;
  end if;

  select max(al.level) into v_max_level
  from approval_levels al
  where al.project_id = v_project_id;

  if v_max_level is null then
    raise exception 'Obra sem niveis de aprovacao configurados.';
  end if;

  -- Obter o papel esperado para o nivel atual
  select al.role into v_expected_role
  from approval_levels al
  where al.project_id = v_project_id and al.level = v_level;

  -- Se chamado por usuario autenticado, valida papel e empresa
  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_company_id
        and contractor_id is null
        and (
          role = v_expected_role
          or role = 'admin'
        )
    ) then
      raise exception 'Usuario nao tem permissao para aprovar no nivel % (papel esperado: %).', v_level, v_expected_role;
    end if;
  end if;

  if v_level >= v_max_level then
    v_new := 'APROVADA';
    update measurements
    set status = v_new, current_level = v_max_level, version = version + 1
    where id = p_measurement_id;
  else
    v_new := 'EM_ANALISE';
    update measurements
    set current_level = v_level + 1, version = version + 1
    where id = p_measurement_id;
  end if;

  return v_new;
end $$;

-- 2. Devolução de medição com justificativa obrigatória e auditoria
create or replace function return_measurement(p_measurement_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status     measurement_status;
  v_company_id uuid;
  v_level      int;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A devolucao exige um motivo.';
  end if;

  select status, company_id, current_level
    into v_status, v_company_id, v_level
  from measurements where id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Somente medicao em analise pode ser devolvida (status atual: %).', v_status;
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_company_id
        and contractor_id is null
    ) then
      raise exception 'Usuario nao tem permissao para devolver medicao.';
    end if;
  end if;

  update measurements
  set status = 'DEVOLVIDA', current_level = 0, version = version + 1
  where id = p_measurement_id;

  update audit_log
  set reason = trim(p_reason)
  where id = (
    select id from audit_log
    where measurement_id = p_measurement_id and action = 'DEVOLVIDA'
    order by created_at desc limit 1
  );
end $$;

-- 3. Ajuste de quantidade aprovada com limite de saldo e auditoria automática
create or replace function adjust_item_approved_qty(
  p_item_id uuid,
  p_qty_approved numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meas_id          uuid;
  v_contract_item_id uuid;
  v_status           measurement_status;
  v_company_id       uuid;
  v_balance          numeric;
begin
  if p_qty_approved is null or p_qty_approved < 0 then
    raise exception 'Quantidade aprovada nao pode ser negativa.';
  end if;

  select mi.measurement_id, mi.contract_item_id, m.status, m.company_id
    into v_meas_id, v_contract_item_id, v_status, v_company_id
  from measurement_items mi
  join measurements m on m.id = mi.measurement_id
  where mi.id = p_item_id;

  if v_meas_id is null then
    raise exception 'Item de medicao nao encontrado.';
  end if;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Item nao pode ser ajustado com a medicao no status %.', v_status;
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_company_id
        and contractor_id is null
    ) then
      raise exception 'Permissao negada para ajustar itens.';
    end if;
  end if;

  -- Valida se a quantidade aprovada respeita o saldo do contrato
  v_balance := contract_item_balance(v_contract_item_id, v_meas_id);
  if p_qty_approved > v_balance then
    raise exception 'Quantidade acima do saldo disponivel para o item. Saldo: %.', trim_scale(v_balance)::text
      using errcode = 'check_violation';
  end if;

  update measurement_items
  set qty_approved = p_qty_approved
  where id = p_item_id;
end $$;

-- 4. Consulta de medições pendentes em análise para a engenharia/construtora
create or replace function get_pending_measurements()
returns table (
  id               uuid,
  protocol         text,
  status           measurement_status,
  current_level    int,
  submitted_at     timestamptz,
  project_id       uuid,
  project_name     text,
  contract_id      uuid,
  contract_number  text,
  contractor_id    uuid,
  contractor_name  text,
  competence       date,
  total_requested  numeric,
  total_approved   numeric,
  items_count      bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    m.id,
    m.protocol,
    m.status,
    m.current_level,
    m.submitted_at,
    p.project_id,
    pr.name as project_name,
    c.id as contract_id,
    c.number as contract_number,
    ct.id as contractor_id,
    ct.name as contractor_name,
    p.competence,
    coalesce(sum(mi.qty_requested * ci.unit_price), 0)::numeric as total_requested,
    coalesce(sum(coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price), 0)::numeric as total_approved,
    count(mi.id) as items_count
  from measurements m
  join measurement_periods p on p.id = m.period_id
  join projects pr           on pr.id = p.project_id
  join contracts c           on c.id = m.contract_id
  join contractors ct        on ct.id = c.contractor_id
  left join measurement_items mi on mi.measurement_id = m.id
  left join contract_items ci    on ci.id = mi.contract_item_id
  where m.status = 'EM_ANALISE'
    and (
      auth.uid() is null
      or exists (
        select 1 from memberships mem
        where mem.user_id = auth.uid()
          and mem.company_id = m.company_id
          and mem.contractor_id is null
          and (
            mem.project_id is null
            or mem.project_id = pr.id
          )
      )
    )
  group by m.id, p.project_id, pr.name, c.id, c.number, ct.id, ct.name, p.competence
  order by m.submitted_at asc nulls last;
end $$;

-- 5. Consulta de itens detalhados da medição para análise da engenharia
create or replace function get_measurement_analysis_details(p_measurement_id uuid)
returns table (
  item_id            uuid,
  contract_item_id   uuid,
  stage_name         text,
  unit_name          text,
  service_name       text,
  service_group      text,
  unit               text,
  unit_price         numeric,
  unit_quantity      numeric,
  contract_balance   numeric,
  qty_requested      numeric,
  qty_approved       numeric,
  subtotal_requested numeric,
  subtotal_approved  numeric,
  notes              text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Valida acesso de leitura à medição
  if auth.uid() is not null then
    if not exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      where m.id = p_measurement_id
        and can_read_contract(c.id)
    ) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  return query
  select
    mi.id as item_id,
    ci.id as contract_item_id,
    st.name as stage_name,
    u.name as unit_name,
    ci.service_name,
    ci.service_group,
    ci.unit::text,
    ci.unit_price,
    ci.quantity as unit_quantity,
    contract_item_balance(ci.id, m.id) as contract_balance,
    mi.qty_requested,
    coalesce(mi.qty_approved, mi.qty_requested) as qty_approved,
    (mi.qty_requested * ci.unit_price)::numeric as subtotal_requested,
    (coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price)::numeric as subtotal_approved,
    mi.notes
  from measurement_items mi
  join measurements m    on m.id = mi.measurement_id
  join contract_items ci on ci.id = mi.contract_item_id
  join units u           on u.id = ci.unit_id
  join stages st         on st.id = u.stage_id
  where mi.measurement_id = p_measurement_id
  order by st.position, u.position, ci.service_name;
end $$;


-- =========================================
-- MIGRATION: 019_faturamento_nf.sql
-- =========================================

/* Migration 019: Faturamento e Gestao de Notas Fiscais
   - submit_invoice (aprimorado com seguranca definer e validacao de permissao do contrato)
   - approve_invoice (aprovacao fiscal e avanco para NF_APROVADA)
   - reject_invoice (recusa fiscal com motivo obrigatorio e retorno para APROVADA)
   - pay_invoice (liquidacao financeira e avanco para PAGA)
   - get_pending_invoices (listagem consolidada de NFs pendentes para a construtora)
   - get_measurement_invoice_details (detalhes da medicao e NFs para o financeiro e empreiteiro)
*/

-- 0. approve_measurement seguro com escalonamento de gerencia e admin
create or replace function approve_measurement(p_measurement_id uuid)
returns measurement_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status        measurement_status;
  v_level         int;
  v_max_level     int;
  v_new           measurement_status;
  v_project_id    uuid;
  v_company_id    uuid;
  v_expected_role app_role;
begin
  select m.status, m.current_level, p.project_id, m.company_id
    into v_status, v_level, v_project_id, v_company_id
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Medicao nao esta em analise (status atual: %).', v_status;
  end if;

  select max(al.level) into v_max_level
  from approval_levels al
  where al.project_id = v_project_id;

  if v_max_level is null then
    raise exception 'Obra sem niveis de aprovacao configurados.';
  end if;

  -- Obter o papel esperado para o nivel atual
  select al.role into v_expected_role
  from approval_levels al
  where al.project_id = v_project_id and al.level = v_level;

  -- Se chamado por usuario autenticado, valida papel e empresa
  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_company_id
        and contractor_id is null
        and (
          role = v_expected_role
          or role = 'admin'
          or role = 'gerencia'
        )
    ) then
      raise exception 'Usuario nao tem permissao para aprovar no nivel % (papel esperado: %).', v_level, v_expected_role;
    end if;
  end if;

  -- Inicializa qty_approved com qty_requested para os itens que nao sofreram ajuste manual
  update measurement_items
  set qty_approved = qty_requested
  where measurement_id = p_measurement_id
    and qty_approved is null;

  if v_level >= v_max_level then
    v_new := 'APROVADA';
    update measurements
    set status        = 'APROVADA',
        current_level = v_level,
        version       = version + 1
    where id = p_measurement_id;
  else
    v_new := 'EM_ANALISE';
    update measurements
    set current_level = v_level + 1,
        version       = version + 1
    where id = p_measurement_id;
  end if;

  return v_new;
end $$;

-- 1. submit_invoice seguro com verificacao de permissao e tolerancia
create or replace function submit_invoice(
  p_measurement_id uuid,
  p_number         text,
  p_issued_on      date,
  p_amount         numeric,
  p_pdf            text default null,
  p_xml            text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    measurement_status;
  v_company   uuid;
  v_contract  uuid;
  v_approved  numeric;
  v_tolerance numeric;
  v_id        uuid;
begin
  if p_number is null or trim(p_number) = '' then
    raise exception 'O numero da nota fiscal e obrigatorio.';
  end if;

  if p_issued_on is null then
    raise exception 'A data de emissao e obrigatoria.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da nota fiscal deve ser positivo.';
  end if;

  select m.status, m.company_id, m.contract_id, p.invoice_tolerance
    into v_status, v_company, v_contract, v_tolerance
  from measurements m
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada para este contrato.';
  end if;

  if v_status <> 'APROVADA' then
    raise exception 'A nota fiscal so pode ser enviada para medicao aprovada (status atual: %).',
      v_status;
  end if;

  v_approved := measurement_total(p_measurement_id, true);

  if abs(p_amount - v_approved) > v_tolerance then
    raise exception
      'Valor da nota (%) diverge do valor aprovado (%). Diferenca aceita: %.',
      p_amount, v_approved, v_tolerance
      using errcode = 'check_violation';
  end if;

  insert into invoices
    (company_id, measurement_id, number, issued_on, amount, pdf_path, xml_path, status)
  values
    (v_company, p_measurement_id, trim(p_number), p_issued_on, p_amount, p_pdf, p_xml, 'RECEBIDA')
  on conflict (measurement_id, number) do update
    set issued_on = excluded.issued_on,
        amount    = excluded.amount,
        pdf_path  = excluded.pdf_path,
        xml_path  = excluded.xml_path,
        status    = 'RECEBIDA'
  returning id into v_id;

  update measurements
  set status = 'NF_ENVIADA', version = version + 1
  where id = p_measurement_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, p_measurement_id, auth.uid(), 'NF_ENVIADA', 'invoice', v_id, p_amount::text);

  return v_id;
end $$;

-- 2. approve_invoice: avanca a nota para APROVADA e a medicao para NF_APROVADA
create or replace function approve_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meas_id   uuid;
  v_comp_id   uuid;
  v_status    measurement_status;
  v_amount    numeric;
begin
  select i.measurement_id, i.company_id, i.amount, m.status
    into v_meas_id, v_comp_id, v_amount, v_status
  from invoices i
  join measurements m on m.id = i.measurement_id
  where i.id = p_invoice_id;

  if v_meas_id is null then
    raise exception 'Nota fiscal nao encontrada.';
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_comp_id
        and contractor_id is null
        and role in ('admin', 'gerencia', 'financeiro')
    ) then
      raise exception 'Usuario sem permissao para aprovar notas fiscais.';
    end if;
  end if;

  if v_status <> 'NF_ENVIADA' then
    raise exception 'Medicao nao esta aguardando conferencia de NF (status atual: %).', v_status;
  end if;

  update invoices
  set status = 'APROVADA'
  where id = p_invoice_id;

  update measurements
  set status = 'NF_APROVADA', version = version + 1
  where id = v_meas_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_comp_id, v_meas_id, auth.uid(), 'NF_APROVADA', 'invoice', p_invoice_id, v_amount::text);
end $$;

-- 3. reject_invoice: rejeita a NF com motivo e retorna a medicao para APROVADA
create or replace function reject_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meas_id   uuid;
  v_comp_id   uuid;
  v_status    measurement_status;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'O motivo da rejeicao da nota fiscal e obrigatorio.';
  end if;

  select i.measurement_id, i.company_id, m.status
    into v_meas_id, v_comp_id, v_status
  from invoices i
  join measurements m on m.id = i.measurement_id
  where i.id = p_invoice_id;

  if v_meas_id is null then
    raise exception 'Nota fiscal nao encontrada.';
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_comp_id
        and contractor_id is null
        and role in ('admin', 'gerencia', 'financeiro')
    ) then
      raise exception 'Usuario sem permissao para rejeitar notas fiscais.';
    end if;
  end if;

  if v_status <> 'NF_ENVIADA' then
    raise exception 'Medicao nao esta com nota fiscal em conferencia (status atual: %).', v_status;
  end if;

  update invoices
  set status = 'REJEITADA'
  where id = p_invoice_id;

  update measurements
  set status = 'APROVADA', version = version + 1
  where id = v_meas_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, reason)
  values
    (v_comp_id, v_meas_id, auth.uid(), 'NF_REJEITADA', 'invoice', p_invoice_id, trim(p_reason));
end $$;

-- 4. pay_invoice: registra o pagamento e avanca a medicao para PAGA
create or replace function pay_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meas_id   uuid;
  v_comp_id   uuid;
  v_status    measurement_status;
  v_amount    numeric;
begin
  select i.measurement_id, i.company_id, i.amount, m.status
    into v_meas_id, v_comp_id, v_amount, v_status
  from invoices i
  join measurements m on m.id = i.measurement_id
  where i.id = p_invoice_id;

  if v_meas_id is null then
    raise exception 'Nota fiscal nao encontrada.';
  end if;

  if auth.uid() is not null then
    if not exists (
      select 1 from memberships
      where user_id = auth.uid()
        and company_id = v_comp_id
        and contractor_id is null
        and role in ('admin', 'gerencia', 'financeiro')
    ) then
      raise exception 'Usuario sem permissao para liquidar pagamentos.';
    end if;
  end if;

  if v_status <> 'NF_APROVADA' then
    raise exception 'A nota fiscal precisa estar aprovada antes do pagamento (status da medicao: %).', v_status;
  end if;

  update invoices
  set status = 'PAGA'
  where id = p_invoice_id;

  update measurements
  set status = 'PAGA', version = version + 1
  where id = v_meas_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_comp_id, v_meas_id, auth.uid(), 'PAGA', 'invoice', p_invoice_id, v_amount::text);
end $$;

-- 5. get_pending_invoices: listagem para o painel de faturamento
create or replace function get_pending_invoices()
returns table (
  measurement_id     uuid,
  invoice_id         uuid,
  protocol           text,
  contractor_name    text,
  project_name       text,
  competence         date,
  measurement_status measurement_status,
  invoice_number     text,
  invoice_issued_on  date,
  invoice_amount     numeric,
  approved_amount    numeric,
  invoice_status     invoice_status,
  pdf_path           text,
  xml_path           text,
  submitted_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id                                      as measurement_id,
    i.id                                      as invoice_id,
    m.protocol,
    c.name                                    as contractor_name,
    p.name                                    as project_name,
    mp.competence,
    m.status                                  as measurement_status,
    i.number                                  as invoice_number,
    i.issued_on                               as invoice_issued_on,
    i.amount                                  as invoice_amount,
    measurement_total(m.id, true)             as approved_amount,
    i.status                                  as invoice_status,
    i.pdf_path,
    i.xml_path,
    i.created_at                              as submitted_at
  from invoices i
  join measurements m on m.id = i.measurement_id
  join contracts ct on ct.id = m.contract_id
  join contractors c on c.id = ct.contractor_id
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.company_id in (select auth_company_ids())
    and m.status in ('NF_ENVIADA', 'NF_APROVADA')
  order by i.created_at desc;
$$;

-- 6. get_measurement_invoice_details: detalhes da medicao e suas notas fiscais
create or replace function get_measurement_invoice_details(p_measurement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_meas record;
  v_inv  record;
  v_rej_reason text;
begin
  select
    m.id,
    m.protocol,
    m.status,
    m.company_id,
    p.name as project_name,
    p.invoice_tolerance,
    c.name as contractor_name,
    ct.number as contract_number,
    mp.competence,
    measurement_total(m.id, true) as approved_amount
  into v_meas
  from measurements m
  join contracts ct on ct.id = m.contract_id
  join contractors c on c.id = ct.contractor_id
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.id = p_measurement_id;

  if v_meas.id is null then
    return null;
  end if;

  if auth.uid() is not null and not can_read_contract((select contract_id from measurements where id = p_measurement_id)) then
    return null;
  end if;

  -- Busca ultima nota emitida
  select
    id, number, issued_on, amount, status, pdf_path, xml_path, created_at
  into v_inv
  from invoices
  where measurement_id = p_measurement_id
  order by created_at desc
  limit 1;

  -- Se ultima nota foi rejeitada, busca o motivo
  if v_inv.status = 'REJEITADA' then
    select reason into v_rej_reason
    from audit_log
    where measurement_id = p_measurement_id
      and action = 'NF_REJEITADA'
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'measurement', jsonb_build_object(
      'id', v_meas.id,
      'protocol', v_meas.protocol,
      'status', v_meas.status,
      'companyId', v_meas.company_id,
      'projectName', v_meas.project_name,
      'contractorName', v_meas.contractor_name,
      'contractNumber', v_meas.contract_number,
      'competence', v_meas.competence,
      'approvedAmount', v_meas.approved_amount,
      'invoiceTolerance', v_meas.invoice_tolerance
    ),
    'invoice', case when v_inv.id is not null then
      jsonb_build_object(
        'id', v_inv.id,
        'number', v_inv.number,
        'issuedOn', v_inv.issued_on,
        'amount', v_inv.amount,
        'status', v_inv.status,
        'pdfPath', v_inv.pdf_path,
        'xmlPath', v_inv.xml_path,
        'rejectionReason', v_rej_reason,
        'createdAt', v_inv.created_at
      )
    else null end
  );
end $$;


-- =========================================
-- MIGRATION: 020_auditoria_espelho_e_contrato.sql
-- =========================================

/* Migration 020: Auditoria detalhada, espelho oficial de medicao e visao do contrato */

-- 1. Linha do tempo de auditoria com atores, detalhes e justificativas
create or replace function get_measurement_audit_timeline(p_measurement_id uuid)
returns table (
  id             uuid,
  action         text,
  actor_name     text,
  actor_role     text,
  level          int,
  old_value      text,
  new_value      text,
  reason         text,
  service_name   text,
  created_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Valida acesso via can_read_contract
  if auth.uid() is not null then
    if not exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      where m.id = p_measurement_id and can_read_contract(c.id)
    ) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  return query
  select
    a.id,
    a.action,
    coalesce(p.full_name, 'Sistema')::text as actor_name,
    coalesce(mem.role::text, 'sistema')::text as actor_role,
    a.level,
    a.old_value,
    a.new_value,
    a.reason,
    ci.service_name,
    a.created_at
  from audit_log a
  left join profiles p on p.id = a.actor_id
  left join memberships mem on mem.user_id = a.actor_id and mem.company_id = a.company_id
  left join measurement_items mi on mi.id = a.entity_id and a.entity = 'measurement_item'
  left join contract_items ci on ci.id = mi.contract_item_id
  where a.measurement_id = p_measurement_id
  order by a.created_at asc;
end $$;

-- 2. Visao completa dos itens contratados e saldos para o empreiteiro
create or replace function get_contract_items_overview(p_contract_id uuid)
returns table (
  item_id          uuid,
  stage_name       text,
  unit_name        text,
  service_name     text,
  service_group    text,
  unit             text,
  quantity         numeric,
  unit_price       numeric,
  total_price      numeric,
  balance_qty      numeric,
  measured_qty     numeric,
  balance_amount   numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if not can_read_contract(p_contract_id) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  return query
  select
    ci.id as item_id,
    coalesce(st.name, 'Geral')::text as stage_name,
    coalesce(u.name, 'Geral')::text as unit_name,
    ci.service_name,
    ci.service_group,
    ci.unit::text,
    ci.quantity,
    ci.unit_price,
    (ci.quantity * ci.unit_price)::numeric as total_price,
    contract_item_balance(ci.id) as balance_qty,
    (ci.quantity - contract_item_balance(ci.id)) as measured_qty,
    (contract_item_balance(ci.id) * ci.unit_price)::numeric as balance_amount
  from contract_items ci
  left join units u on u.id = ci.unit_id
  left join stages st on st.id = u.stage_id
  where ci.contract_id = p_contract_id
  order by coalesce(st.position, 0), coalesce(u.position, 0), ci.service_name;
end $$;

-- 3. Listagem flexível de medições corporativas por status
create or replace function get_company_measurements(p_status text default null)
returns table (
  id               uuid,
  protocol         text,
  status           measurement_status,
  current_level    int,
  submitted_at     timestamptz,
  project_id       uuid,
  project_name     text,
  contract_id      uuid,
  contract_number  text,
  contractor_id    uuid,
  contractor_name  text,
  competence       date,
  total_requested  numeric,
  total_approved   numeric,
  items_count      bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    m.id,
    m.protocol,
    m.status,
    m.current_level,
    m.submitted_at,
    p.project_id,
    pr.name as project_name,
    c.id as contract_id,
    c.number as contract_number,
    ct.id as contractor_id,
    ct.name as contractor_name,
    p.competence,
    coalesce(sum(mi.qty_requested * ci.unit_price), 0)::numeric as total_requested,
    coalesce(sum(coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price), 0)::numeric as total_approved,
    count(mi.id) as items_count
  from measurements m
  join measurement_periods p on p.id = m.period_id
  join projects pr           on pr.id = p.project_id
  join contracts c           on c.id = m.contract_id
  join contractors ct        on ct.id = c.contractor_id
  left join measurement_items mi on mi.measurement_id = m.id
  left join contract_items ci    on ci.id = mi.contract_item_id
  where (
      p_status is null
      or (p_status = 'EM_ANALISE' and m.status = 'EM_ANALISE')
      or (p_status = 'APROVADAS' and m.status in ('APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA'))
      or (p_status = 'DEVOLVIDAS' and m.status = 'DEVOLVIDA')
      or (m.status::text = p_status)
    )
    and m.status <> 'RASCUNHO'
    and (
      auth.uid() is null
      or exists (
        select 1 from memberships mem
        where mem.user_id = auth.uid()
          and mem.company_id = m.company_id
          and mem.contractor_id is null
          and (
            mem.project_id is null
            or mem.project_id = pr.id
          )
      )
    )
  group by m.id, p.project_id, pr.name, c.id, c.number, ct.id, ct.name, p.competence
  order by m.submitted_at desc nulls last;
end $$;

-- 4. Espelho oficial da medição estruturado em JSON
create or replace function get_measurement_statement(p_measurement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is not null then
    if not exists (
      select 1 from measurements m
      join contracts c on c.id = m.contract_id
      where m.id = p_measurement_id and can_read_contract(c.id)
    ) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  select jsonb_build_object(
    'id', m.id,
    'protocol', m.protocol,
    'status', m.status,
    'current_level', m.current_level,
    'submitted_at', m.submitted_at,
    'competence', p.competence,
    'company_name', comp.name,
    'project_name', pr.name,
    'contract_number', c.number,
    'contract_description', c.description,
    'contractor_name', ct.name,
    'contractor_document', ct.document,
    'total_requested', measurement_total(m.id, false),
    'total_approved', measurement_total(m.id, true),
    'invoice_number', inv.number,
    'invoice_amount', inv.amount,
    'invoice_issued_on', inv.issued_on,
    'invoice_status', inv.status,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mi.id,
          'stage_name', coalesce(st.name, 'Geral'),
          'unit_name', coalesce(u.name, 'Geral'),
          'service_name', ci.service_name,
          'service_group', ci.service_group,
          'unit', ci.unit::text,
          'unit_price', ci.unit_price,
          'contract_quantity', ci.quantity,
          'qty_requested', mi.qty_requested,
          'qty_approved', coalesce(mi.qty_approved, mi.qty_requested),
          'subtotal_requested', (mi.qty_requested * ci.unit_price),
          'subtotal_approved', (coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price),
          'notes', mi.notes
        ) order by coalesce(st.position, 0), coalesce(u.position, 0), ci.service_name
      )
      from measurement_items mi
      join contract_items ci on ci.id = mi.contract_item_id
      left join units u on u.id = ci.unit_id
      left join stages st on st.id = u.stage_id
      where mi.measurement_id = m.id
    ), '[]'::jsonb)
  ) into v_result
  from measurements m
  join measurement_periods p on p.id = m.period_id
  join projects pr on pr.id = p.project_id
  join companies comp on comp.id = m.company_id
  join contracts c on c.id = m.contract_id
  join contractors ct on ct.id = c.contractor_id
  left join lateral (
    select number, amount, issued_on, status
    from invoices
    where measurement_id = m.id
    order by created_at desc limit 1
  ) inv on true
  where m.id = p_measurement_id;

  return v_result;
end $$;


-- =========================================
-- MIGRATION: 021_resumo_servicos_e_progresso.sql
-- =========================================

/* Melhorias pedidas no primeiro teste com o cliente.

   1. Resumo por servico: quanto de cada servico existe no contrato inteiro,
      somando todas as casas. Hoje so havia a visao item a item (por casa).
   2. Progresso da medicao corrente, para a trilha de status na tela inicial.
   3. Data prevista de pagamento, que a trilha precisa mostrar e nao existia. */

alter table invoices
  add column if not exists expected_payment_date date;

/* Agrega por servico e unidade de medida. Agrupar so por nome somaria
   "Contrapiso em m2" com "Contrapiso em verba" e produziria um numero
   sem significado. */
create or replace function get_contract_services_summary(p_contract_id uuid)
returns table (
  service_name    text,
  service_group   text,
  unit            text,
  total_quantity  numeric,
  measured_quantity numeric,
  balance_quantity  numeric,
  total_amount    numeric,
  measured_amount numeric,
  balance_amount  numeric,
  locations       bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    if not can_read_contract(p_contract_id) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  return query
  select
    ci.service_name,
    ci.service_group,
    ci.unit::text,
    sum(ci.quantity)                                              as total_quantity,
    sum(ci.quantity - contract_item_balance(ci.id))               as measured_quantity,
    sum(contract_item_balance(ci.id))                             as balance_quantity,
    sum(ci.quantity * ci.unit_price)                              as total_amount,
    sum((ci.quantity - contract_item_balance(ci.id)) * ci.unit_price) as measured_amount,
    sum(contract_item_balance(ci.id) * ci.unit_price)             as balance_amount,
    count(*)                                                      as locations
  from contract_items ci
  where ci.contract_id = p_contract_id
  group by ci.service_name, ci.service_group, ci.unit
  order by ci.service_group nulls first, ci.service_name;
end $$;

/* A medicao viva do contrato, para a trilha de status.
   Viva = qualquer status que nao seja CANCELADA. Se houver mais de uma
   competencia aberta, devolve a mais recente. */
create or replace function get_current_measurement_progress(p_contract_id uuid)
returns table (
  measurement_id        uuid,
  status                text,
  current_level         int,
  protocol              text,
  competence            date,
  submitted_at          timestamptz,
  project_id            uuid,
  invoice_status        text,
  invoice_number        text,
  expected_payment_date date
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null then
    if not can_read_contract(p_contract_id) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  return query
  select
    m.id,
    m.status::text,
    m.current_level,
    m.protocol,
    p.competence,
    m.submitted_at,
    p.project_id,
    i.status::text,
    i.number,
    i.expected_payment_date
  from measurements m
  join measurement_periods p on p.id = m.period_id
  left join invoices i on i.measurement_id = m.id
  where m.contract_id = p_contract_id
    and m.status <> 'CANCELADA'
  order by p.competence desc
  limit 1;
end $$;


-- =========================================
-- MIGRATION: 022_previsao_pagamento.sql
-- =========================================

/* O financeiro informa quando pretende pagar.

   A trilha de status na tela inicial do empreiteiro mostra "pagamento previsto
   para dia X". Sem alguem informando essa data, a trilha exibiria uma promessa
   vazia. Quem sabe a data e o financeiro, no momento em que aprova a nota. */

create or replace function set_invoice_expected_payment(
  p_invoice_id uuid,
  p_expected_date date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_measurement uuid;
  v_company     uuid;
  v_status      invoice_status;
begin
  select i.measurement_id, i.company_id, i.status
    into v_measurement, v_company, v_status
  from invoices i
  where i.id = p_invoice_id;

  if v_measurement is null then
    raise exception 'Nota fiscal nao encontrada.';
  end if;

  -- Quem enxerga o contrato da medicao pode informar a previsao.
  -- O empreiteiro tambem enxerga, mas nao chega aqui: a tela e do financeiro.
  if auth.uid() is not null then
    if not exists (
      select 1 from measurements m
      where m.id = v_measurement and can_read_contract(m.contract_id)
    ) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  if v_status = 'PAGA' then
    raise exception 'A nota ja foi paga; nao faz sentido prever pagamento.';
  end if;

  if p_expected_date is not null and p_expected_date < current_date then
    raise exception 'A data prevista de pagamento nao pode estar no passado.';
  end if;

  update invoices
  set expected_payment_date = p_expected_date
  where id = p_invoice_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, v_measurement, auth.uid(), 'PREVISAO_PAGAMENTO', 'invoice',
     p_invoice_id, p_expected_date::text);
end $$;


-- =========================================
-- MIGRATION: 023_marca_dados_de_demonstracao.sql
-- =========================================

/* Protege os dados de demonstração da limpeza dos testes.

   O `cleanup()` da suíte dava `truncate companies cascade` e apagava todos os
   usuários do Auth. Isso derrubava a demonstração inteira: rodar os testes
   deixava o banco vazio, e quem abrisse o link nesse intervalo não conseguia
   nem entrar. Aconteceu duas vezes em um único dia de trabalho.

   A marca abaixo permite que a limpeza apague só o que os testes criaram.
   Todas as chaves estrangeiras para `companies` cascateiam no delete, então
   remover a empresa de teste leva junto obras, contratos e medições dela. */

alter table companies
  add column if not exists is_demo boolean not null default false;

comment on column companies.is_demo is
  'Empresa de demonstração. A limpeza dos testes nunca a remove.';


-- =========================================
-- MIGRATION: 024_anexos_de_medicao.sql
-- =========================================

/* Foto e observação por serviço na medição.

   O spec pede os dois como opcionais na tela de preenchimento, e a observação
   já trafegava até o espelho — faltava a tela coletar. A foto não existia de
   forma alguma: `attachments` só tinha política de leitura, então nada podia
   ser gravado por um usuário autenticado.

   A foto é a evidência que sustenta a conferência. Sem ela o engenheiro
   aprova no escuro, e a pergunta "por que 20 m²?" não tem resposta. */

/* O anexo aponta para o item DE CONTRATO, não para o item de medição.
   Motivo: o empreiteiro tira a foto antes de salvar a quantidade, e o
   measurement_item pode nem existir ainda. Amarrar no item de contrato
   permite anexar em qualquer ordem. */
alter table attachments
  add column if not exists contract_item_id uuid references contract_items(id) on delete cascade;

create index if not exists attachments_medicao_item_idx
  on attachments (measurement_id, contract_item_id);

/* Registra um anexo já enviado ao storage.
   O upload em si acontece na Server Action, que grava sob o caminho
   <company_id>/... — é isso que a policy de storage exige. */
create or replace function attach_measurement_file(
  p_measurement_id  uuid,
  p_contract_item_id uuid,
  p_bucket          text,
  p_path            text,
  p_mime_type       text,
  p_size_bytes      bigint
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company  uuid;
  v_contract uuid;
  v_status   measurement_status;
  v_id       uuid;
begin
  select m.company_id, m.contract_id, m.status
    into v_company, v_contract, v_status
  from measurements m
  where m.id = p_measurement_id;

  if v_company is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada.';
  end if;

  /* Mesma janela de edicao dos itens: depois de enviada, a medicao esta
     sob analise e as evidencias nao podem mais mudar. */
  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'A medicao nao aceita mais anexos no status %.', v_status;
  end if;

  if p_contract_item_id is not null and not exists (
    select 1 from contract_items ci
    where ci.id = p_contract_item_id and ci.contract_id = v_contract
  ) then
    raise exception 'O item nao pertence ao contrato desta medicao.';
  end if;

  insert into attachments
    (company_id, measurement_id, contract_item_id, bucket, path, mime_type, size_bytes)
  values
    (v_company, p_measurement_id, p_contract_item_id, p_bucket, p_path, p_mime_type, p_size_bytes)
  returning id into v_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, p_measurement_id, auth.uid(), 'ANEXO_ADICIONADO', 'attachment', v_id, p_path);

  return v_id;
end $$;

create or replace function remove_measurement_file(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company     uuid;
  v_measurement uuid;
  v_contract    uuid;
  v_status      measurement_status;
  v_path        text;
begin
  select a.company_id, a.measurement_id, a.path
    into v_company, v_measurement, v_path
  from attachments a
  where a.id = p_attachment_id;

  if v_company is null then
    raise exception 'Anexo nao encontrado.';
  end if;

  select m.contract_id, m.status into v_contract, v_status
  from measurements m where m.id = v_measurement;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'A medicao nao permite remover anexos no status %.', v_status;
  end if;

  delete from attachments where id = p_attachment_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, old_value)
  values
    (v_company, v_measurement, auth.uid(), 'ANEXO_REMOVIDO', 'attachment', p_attachment_id, v_path);
end $$;

/* Anexos de uma medicao, opcionalmente filtrados por item de contrato.
   Usada tanto pela tela do empreiteiro quanto pela analise da engenharia. */
create or replace function get_measurement_files(
  p_measurement_id uuid,
  p_contract_item_id uuid default null
)
returns table (
  id               uuid,
  contract_item_id uuid,
  bucket           text,
  path             text,
  mime_type        text,
  size_bytes       bigint,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_contract uuid;
begin
  select m.contract_id into v_contract from measurements m where m.id = p_measurement_id;

  if v_contract is null then
    return;
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada.';
  end if;

  return query
  select a.id, a.contract_item_id, a.bucket, a.path, a.mime_type, a.size_bytes, a.created_at
  from attachments a
  where a.measurement_id = p_measurement_id
    and (p_contract_item_id is null or a.contract_item_id = p_contract_item_id)
  order by a.created_at;
end $$;


-- =========================================
-- MIGRATION: 025_reabertura_com_tela.sql
-- =========================================

/* Reabertura de período: painel e trava de permissão.

   A função `reopen_period` existia desde a fundação e nenhuma tela chamava.
   Na prática, quem perdesse o dia 10 ficava sem solução — e em obra isso
   acontece todo mês.

   Duas coisas aqui:
   1. Uma consulta que mostra, para o período corrente, quem já enviou, quem
      não enviou e para quem o prazo foi reaberto.
   2. Uma trava: reabrir é ato da construtora. O empreiteiro enxerga o próprio
      contrato e, sem esta verificação, poderia reabrir o próprio prazo. */

/* Usuario e da equipe da construtora quando tem vinculo na empresa SEM
   contractor_id. Empreiteiro sempre tem contractor_id preenchido. */
create or replace function is_company_staff(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid()
      and m.company_id = p_company_id
      and m.contractor_id is null
  )
$$;

/* Situacao de cada empreiteiro no periodo: enviou? esta aberto para ele? */
create or replace function get_period_contractors_status(p_period_id uuid)
returns table (
  contractor_id      uuid,
  contractor_name    text,
  contract_id        uuid,
  contract_number    text,
  measurement_id     uuid,
  measurement_status text,
  protocol           text,
  period_open        boolean,
  reopened_until     timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_project uuid;
  v_company uuid;
begin
  select p.project_id, p.company_id into v_project, v_company
  from measurement_periods p where p.id = p_period_id;

  if v_project is null then
    return;
  end if;

  if auth.uid() is not null and not is_company_staff(v_company) then
    raise exception 'Apenas a equipe da construtora acessa o painel de prazos.';
  end if;

  return query
  select
    ct.id,
    ct.name,
    c.id,
    c.number,
    m.id,
    m.status::text,
    m.protocol,
    is_period_open(p_period_id, ct.id),
    (
      select max(r.reopened_until)
      from period_reopenings r
      where r.period_id = p_period_id and r.contractor_id = ct.id
    )
  from contracts c
  join contractors ct on ct.id = c.contractor_id
  left join measurements m
    on m.contract_id = c.id
   and m.period_id = p_period_id
   and m.status <> 'CANCELADA'
  where c.project_id = v_project
  order by ct.name;
end $$;

/* Mesma assinatura de antes, agora com a trava de permissao.
   A checagem so vale para chamada autenticada: o seed e os testes rodam
   como superusuario, com auth.uid() nulo. */
create or replace function reopen_period(
  p_period_id     uuid,
  p_contractor_id uuid,
  p_until         timestamptz,
  p_reason        text
)
returns uuid
language plpgsql
/* security definer: a funcao grava em period_reopenings e audit_log, que tem
   RLS sem policy de escrita. Ela faz a propria checagem de permissao acima —
   sem isto, um engenheiro legitimo levava "row violates row-level security". */
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_id      uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reabertura exige um motivo.';
  end if;

  if p_until <= now() then
    raise exception 'A reabertura precisa de uma data futura.';
  end if;

  select company_id into v_company from measurement_periods where id = p_period_id;
  if v_company is null then
    raise exception 'Periodo nao encontrado.';
  end if;

  if auth.uid() is not null and not is_company_staff(v_company) then
    raise exception 'Apenas a equipe da construtora pode reabrir um prazo.';
  end if;

  insert into period_reopenings
    (company_id, period_id, contractor_id, reopened_until, authorized_by, reason)
  values (v_company, p_period_id, p_contractor_id, p_until, auth.uid(), p_reason)
  returning id into v_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value, reason)
  values
    (v_company, null, auth.uid(), 'PERIODO_REABERTO', 'period_reopening', v_id,
     p_until::text, p_reason);

  return v_id;
end $$;


-- =========================================
-- MIGRATION: 026_cancelamento_de_medicao.sql
-- =========================================

/* Cancelamento de medição.

   A máquina de estados previa `CANCELADA` desde a fundação e nenhuma tela
   chamava. Na prática não existia saída: uma medição aprovada com erro ficava
   aprovada para sempre, porque o desenho manda corrigir cancelando e
   refazendo — justamente para o histórico não virar ficção.

   Cancelar libera o saldo de volta: `contract_item_balance` não conta medição
   cancelada. E o índice parcial `measurements_one_active` exclui CANCELADA,
   então o par período/contrato volta a aceitar uma medição nova. */

create or replace function cancel_measurement(
  p_measurement_id uuid,
  p_reason         text
)
returns void
language plpgsql
/* security definer: grava em measurements e audit_log, que têm RLS sem
   política de escrita. A checagem de permissão está aqui dentro. */
security definer
set search_path to 'public'
as $$
declare
  v_company  uuid;
  v_contract uuid;
  v_status   measurement_status;
  v_protocol text;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'O cancelamento exige um motivo.';
  end if;

  select m.company_id, m.contract_id, m.status, m.protocol
    into v_company, v_contract, v_status, v_protocol
  from measurements m
  where m.id = p_measurement_id;

  if v_company is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  /* Cancelar e ato da construtora. O empreiteiro enxerga a propria medicao e,
     sem esta trava, poderia cancelar uma medicao ja aprovada para refazer com
     outro valor. */
  if auth.uid() is not null and not is_company_staff(v_company) then
    raise exception 'Apenas a equipe da construtora pode cancelar uma medicao.';
  end if;

  if v_status = 'CANCELADA' then
    raise exception 'Esta medicao ja esta cancelada.';
  end if;

  if v_status = 'PAGA' then
    raise exception 'Medicao ja paga nao pode ser cancelada. Trate como acerto no proximo periodo.';
  end if;

  update measurements
  set status = 'CANCELADA', version = version + 1
  where id = p_measurement_id;

  /* O protocolo morre com a medicao: next_protocol so conta medicoes com
     protocolo nao nulo, e a cancelada continua contando. Numero nao se
     reaproveita — e isso que sustenta a rastreabilidade. */

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id,
     old_value, new_value, reason)
  values
    (v_company, p_measurement_id, auth.uid(), 'CANCELADA', 'measurement',
     p_measurement_id, v_status::text, 'CANCELADA', trim(p_reason));
end $$;


-- =========================================
-- MIGRATION: 027_faxina.sql
-- =========================================

/* Faxina dos achados que as revisões deixaram registrados.

   Três dos cinco já estavam fechados e ninguém tinha percebido:

   - A constante `URL` que sombreava a classe global em tests/helpers/auth.ts
     virou `SUPABASE_URL` em algum momento.
   - `contract_item_balance` devolver NULL para item inexistente deixou de ser
     alcançável: a checagem de contrato cruzado em `enforce_item_balance` roda
     antes e um item inexistente cai no `is distinct from`, levantando exceção.
   - A validação cross-contract no schema foi fechada por trigger na 007.

   O nome do pacote diferente do nome da pasta fica como está: é exigência do
   npm, que não aceita maiúsculas.

   Resta uma: a função abaixo ficou sem consumidor quando a migration 004
   reescreveu `can_read_contract` para escopar por empresa. Manter função de
   permissão sem uso é convite a alguém reutilizá-la achando que ainda vale — e
   ela é justamente a versão global, sem escopo de empresa, que causou o bug de
   o engenheiro perder acesso aos contratos da própria construtora. */

drop function if exists auth_contractor_ids();


-- =========================================
-- MIGRATION: 028_notificacoes.sql
-- =========================================

/* Notificações dentro do sistema.

   Três seções do spec (8, 9 e 44) tratam de avisar o empreiteiro: que a
   medição abriu, que o prazo está acabando, que foi devolvida, que foi
   aprovada, que o pagamento saiu. Nada disso existia — ele só entrava se
   lembrasse, e o engenheiro só sabia que chegou medição se fosse olhar.

   O que nasce de evento (enviada, devolvida, aprovada, NF, paga, cancelada)
   é gerado por gatilho, junto da mudança de status. O que depende de tempo
   (período abriu, prazo está perto) fica em funções prontas para um agendador
   chamar — sem agendador configurado elas simplesmente não são chamadas, e
   isso é melhor do que prometer aviso que não sai.

   E-mail não entra aqui: exige provedor com credencial. A tabela guarda
   `emailed_at` para que o envio possa ser plugado depois sem migrar de novo. */

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  measurement_id uuid references measurements(id) on delete cascade,
  kind           text not null,
  title          text not null,
  body           text,
  link           text,
  read_at        timestamptz,
  emailed_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index notifications_destinatario_idx
  on notifications (user_id, read_at, created_at desc);

alter table notifications enable row level security;

/* Cada um lê só as próprias. */
create policy notifications_select on notifications for select
  using (user_id = auth.uid());

/* Marcar como lida é a única escrita que o usuário faz, e só nas dele. */
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* --- Destinatários ------------------------------------------------------ */

/* Usuarios vinculados a um empreiteiro especifico. */
create or replace function usuarios_do_contratado(p_company uuid, p_contractor uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from memberships m
  where m.company_id = p_company and m.contractor_id = p_contractor
$$;

/* Equipe da construtora: vinculo na empresa SEM contractor_id.
   Opcionalmente filtrada por papel, para a NF ir so ao financeiro. */
create or replace function usuarios_da_construtora(
  p_company uuid,
  p_roles app_role[] default null
)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from memberships m
  where m.company_id = p_company
    and m.contractor_id is null
    and (p_roles is null or m.role = any(p_roles))
$$;

create or replace function notificar(
  p_company     uuid,
  p_users       uuid[],
  p_kind        text,
  p_title       text,
  p_body        text,
  p_measurement uuid default null,
  p_link        text default null
)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user  uuid;
  v_total int := 0;
begin
  if p_users is null then
    return 0;
  end if;

  foreach v_user in array p_users loop
    insert into notifications
      (company_id, user_id, measurement_id, kind, title, body, link)
    values
      (p_company, v_user, p_measurement, p_kind, p_title, p_body, p_link);
    v_total := v_total + 1;
  end loop;

  return v_total;
end $$;

/* --- Gatilho de eventos da medição -------------------------------------- */

create or replace function notify_measurement_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_contractor uuid;
  v_numero     text;
  v_protocolo  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select c.contractor_id, c.number into v_contractor, v_numero
  from contracts c where c.id = new.contract_id;

  v_protocolo := coalesce(new.protocol, 'sem protocolo');

  if new.status = 'EM_ANALISE' and old.status in ('RASCUNHO', 'DEVOLVIDA') then
    perform notificar(
      new.company_id,
      usuarios_da_construtora(new.company_id),
      'MEDICAO_RECEBIDA',
      'Medição recebida para análise',
      format('Contrato %s enviou a medição %s.', v_numero, v_protocolo),
      new.id,
      '/analise/' || new.id
    );

  elsif new.status = 'DEVOLVIDA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'MEDICAO_DEVOLVIDA',
      'Sua medição foi devolvida',
      format('A medição %s precisa de correção. Veja o motivo e reenvie.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'APROVADA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'MEDICAO_APROVADA',
      'Medição aprovada, pode emitir a nota',
      format('A medição %s foi aprovada. O faturamento está liberado.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'NF_ENVIADA' then
    perform notificar(
      new.company_id,
      usuarios_da_construtora(new.company_id, array['financeiro', 'gerencia', 'admin']::app_role[]),
      'NF_RECEBIDA',
      'Nota fiscal recebida',
      format('Contrato %s enviou a nota da medição %s.', v_numero, v_protocolo),
      new.id,
      '/faturamento'
    );

  elsif new.status = 'NF_APROVADA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'NF_APROVADA',
      'Sua nota fiscal foi aprovada',
      format('A nota da medição %s foi conferida e aprovada.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'PAGA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'PAGAMENTO',
      'Pagamento registrado',
      format('O pagamento da medição %s foi registrado.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'CANCELADA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'MEDICAO_CANCELADA',
      'Medição cancelada',
      format('A medição %s foi cancelada pela construtora.', v_protocolo),
      new.id,
      '/medicoes'
    );
  end if;

  return new;
end $$;

create trigger measurements_notify
  after update of status on measurements
  for each row execute function notify_measurement_change();

/* --- Avisos que dependem de tempo --------------------------------------- */

/* Período abriu: avisa todos os empreiteiros com contrato na obra.
   Idempotente — chamar duas vezes no mesmo período não duplica o aviso. */
create or replace function notify_period_opened(p_period_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_project uuid;
  v_comp    date;
  v_fecha   timestamptz;
  v_total   int := 0;
  r         record;
begin
  select p.company_id, p.project_id, p.competence, p.closes_at
    into v_company, v_project, v_comp, v_fecha
  from measurement_periods p where p.id = p_period_id;

  if v_company is null then
    return 0;
  end if;

  for r in
    select distinct c.contractor_id
    from contracts c
    where c.project_id = v_project
  loop
    /* Nao repete o aviso para quem ja recebeu deste periodo. */
    if exists (
      select 1 from notifications n
      join memberships m on m.user_id = n.user_id
      where n.kind = 'PERIODO_ABERTO'
        and n.body like '%' || to_char(v_comp, 'MM/YYYY') || '%'
        and m.contractor_id = r.contractor_id
        and n.company_id = v_company
    ) then
      continue;
    end if;

    v_total := v_total + notificar(
      v_company,
      usuarios_do_contratado(v_company, r.contractor_id),
      'PERIODO_ABERTO',
      'Medição aberta',
      format('A medição de %s está disponível. O prazo termina em %s.',
             to_char(v_comp, 'MM/YYYY'), to_char(v_fecha, 'DD/MM/YYYY')),
      null,
      '/medicao'
    );
  end loop;

  return v_total;
end $$;

/* Prazo se aproximando: avisa so quem ainda NAO enviou.
   Feita para um agendador chamar uma vez por dia. */
create or replace function notify_deadline_approaching(p_period_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_project uuid;
  v_comp    date;
  v_fecha   timestamptz;
  v_dias    int;
  v_total   int := 0;
  r         record;
begin
  select p.company_id, p.project_id, p.competence, p.closes_at
    into v_company, v_project, v_comp, v_fecha
  from measurement_periods p where p.id = p_period_id;

  if v_company is null or v_fecha < now() then
    return 0;
  end if;

  v_dias := greatest(0, (v_fecha::date - current_date));

  for r in
    select c.contractor_id
    from contracts c
    left join measurements m
      on m.contract_id = c.id
     and m.period_id = p_period_id
     and m.status not in ('RASCUNHO', 'CANCELADA')
    where c.project_id = v_project
      and m.id is null
  loop
    v_total := v_total + notificar(
      v_company,
      usuarios_do_contratado(v_company, r.contractor_id),
      'PRAZO_PROXIMO',
      case when v_dias <= 1 then 'Último dia para enviar sua medição'
           else format('Faltam %s dias para o fim do prazo', v_dias) end,
      format('A medição de %s ainda não foi enviada. O prazo termina em %s.',
             to_char(v_comp, 'MM/YYYY'), to_char(v_fecha, 'DD/MM/YYYY')),
      null,
      '/medicao'
    );
  end loop;

  return v_total;
end $$;

/* Marcar como lida. A policy de update ja restringe ao dono. */
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total int;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any(p_ids));

  get diagnostics v_total = row_count;
  return v_total;
end $$;


-- =========================================
-- SEED DE DEMONSTRACAO
-- =========================================

/* Seed de demonstracao. Roda automaticamente em `supabase db reset`.
   Uma construtora, uma obra de 20 casas, dois empreiteiros,
   quatro competencias de historico e o periodo corrente aberto. */

do $$
declare
  v_company   uuid;
  v_project   uuid;
  v_stage     uuid;
  v_type      uuid;
  v_alfa      uuid;
  v_beta      uuid;
  v_ct_alfa   uuid;
  v_ct_beta   uuid;
  v_unit      uuid;
  v_period    uuid;
  v_meas      uuid;
  v_item      uuid;
  i           int;
  m           int;
  v_comp      date;
  v_status    text;
  v_servico   record;
begin
  insert into companies (name, is_demo) values ('Construtora Vista Ltda', true)
  returning id into v_company;

  insert into projects (company_id, name, unit_label, approval_levels,
                        invoice_tolerance, measurement_input_mode)
  values (v_company, 'Residencial Vista Alta', 'casa', 3, 0, 'quantidade')
  returning id into v_project;

  insert into approval_levels (company_id, project_id, level, label, role) values
    (v_company, v_project, 1, 'Engenharia',  'engenharia'),
    (v_company, v_project, 2, 'Coordenacao', 'coordenacao'),
    (v_company, v_project, 3, 'Gerencia',    'gerencia');

  insert into stages (company_id, project_id, name, position)
  values (v_company, v_project, 'Casas 01 a 20', 1)
  returning id into v_stage;

  insert into unit_types (company_id, project_id, name, area)
  values (v_company, v_project, 'Tipologia padrao', 70)
  returning id into v_type;

  insert into contractors (company_id, name, document)
  values (v_company, 'Empreeteira Alfa Servicos Civis', '12.345.678/0001-90')
  returning id into v_alfa;

  insert into contractors (company_id, name, document)
  values (v_company, 'Beta Instalacoes', '98.765.432/0001-10')
  returning id into v_beta;

  insert into contracts (company_id, project_id, contractor_id, number, description,
                         starts_on, ends_on)
  values (v_company, v_project, v_alfa, '023/2026', 'Servicos civis - alvenaria e acabamento',
          '2026-01-05', '2026-12-20')
  returning id into v_ct_alfa;

  insert into contracts (company_id, project_id, contractor_id, number, description,
                         starts_on, ends_on)
  values (v_company, v_project, v_beta, '024/2026', 'Instalacoes hidraulicas e eletricas',
          '2026-02-01', '2026-12-20')
  returning id into v_ct_beta;

  -- 20 casas, cada uma com 4 servicos da Alfa e 2 da Beta
  for i in 1..20 loop
    insert into units (company_id, stage_id, unit_type_id, name, position)
    values (v_company, v_stage, v_type, 'Casa ' || lpad(i::text, 2, '0'), i)
    returning id into v_unit;

    for v_servico in
      select * from (values
        ('Contrapiso',           'Pisos',        'm2'::measurement_unit,  86.0, 112.0, v_ct_alfa),
        ('Reboco interno',       'Revestimento', 'm2'::measurement_unit, 120.0,  90.0, v_ct_alfa),
        ('Pintura interna',      'Pintura',      'm2'::measurement_unit, 120.0,  65.0, v_ct_alfa),
        ('Esquadrias',           'Esquadrias',   'un'::measurement_unit,  12.0, 380.0, v_ct_alfa),
        ('Instalacao eletrica',  'Instalacoes',  'pt'::measurement_unit,  45.0, 150.0, v_ct_beta),
        ('Instalacao hidraulica','Instalacoes',  'pt'::measurement_unit,  35.0, 140.0, v_ct_beta)
      ) as t(nome, grupo, un, qtd, preco, contrato)
    loop
      insert into contract_items
        (company_id, contract_id, unit_id, service_name, service_group, unit, quantity, unit_price)
      values
        (v_company, v_servico.contrato, v_unit, v_servico.nome, v_servico.grupo,
         v_servico.un, v_servico.qtd, v_servico.preco);
    end loop;
  end loop;

  -- quatro competencias de historico, encerradas
  m := 0;
  foreach v_comp in array array['2026-05-01','2026-06-01','2026-07-01','2026-08-01']::date[]
  loop
    m := m + 1;
    v_status := case m
      when 1 then 'PAGA'
      when 2 then 'PAGA'
      when 3 then 'NF_APROVADA'
      else 'APROVADA'
    end;

    insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
    values (v_company, v_project, v_comp, v_comp, v_comp + interval '9 days 23 hours')
    returning id into v_period;

    -- cria inicialmente como EM_ANALISE para inserir os itens
    insert into measurements
      (company_id, period_id, contract_id, status, current_level, protocol, submitted_at)
    values
      (v_company, v_period, v_ct_alfa, 'EM_ANALISE', 3,
       'MED-' || to_char(v_comp, 'YYYY-MM') || '-001', v_comp + interval '8 days')
    returning id into v_meas;

    -- mede 15% do contratado de cada servico da Alfa nas 8 primeiras casas
    for v_item in
      select ci.id from contract_items ci
      join units u on u.id = ci.unit_id
      where ci.contract_id = v_ct_alfa and u.position <= 8
    loop
      insert into measurement_items
        (company_id, measurement_id, contract_item_id, qty_requested, qty_approved)
      select v_company, v_meas, ci.id,
             round(ci.quantity * 0.15, 2), round(ci.quantity * 0.15, 2)
      from contract_items ci where ci.id = v_item;
    end loop;

    -- atualiza para o status final do historico
    update measurements set status = v_status::measurement_status where id = v_meas;

    if v_status in ('PAGA', 'NF_APROVADA') then
      insert into invoices
        (company_id, measurement_id, number, issued_on, amount, status, pdf_path)
      values
        (v_company, v_meas, (5000 + m)::text, v_comp + interval '12 days',
         measurement_total(v_meas, true),
         case when v_status = 'PAGA' then 'PAGA' else 'APROVADA' end::invoice_status,
         v_company || '/notas/' || (5000 + m) || '.pdf');
    end if;
  end loop;

  -- competencia corrente: periodo aberto, esperando o empreiteiro
  insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
  values (v_company, v_project, date_trunc('month', now())::date,
          now() - interval '2 days', now() + interval '7 days')
  returning id into v_period;

  -- a Beta ja enviou e esta em analise na coordenacao
  insert into measurements
    (company_id, period_id, contract_id, status, current_level, protocol, submitted_at)
  values
    (v_company, v_period, v_ct_beta, 'EM_ANALISE', 2,
     'MED-' || to_char(now(), 'YYYY-MM') || '-002', now() - interval '1 day')
  returning id into v_meas;

  for v_item in
    select ci.id from contract_items ci
    join units u on u.id = ci.unit_id
    where ci.contract_id = v_ct_beta and u.position <= 5
  loop
    insert into measurement_items
      (company_id, measurement_id, contract_item_id, qty_requested)
    select v_company, v_meas, ci.id, round(ci.quantity * 0.20, 2)
    from contract_items ci where ci.id = v_item;
  end loop;

  -- Usuarios de demonstracao. Senha de todos: demo1234
  for v_servico in
    select * from (values
      ('alfa@demo.test',       'Jose da Silva',    'empreiteiro'::app_role, v_alfa),
      ('beta@demo.test',       'Marcos Beta',      'empreiteiro'::app_role, v_beta),
      ('engenharia@demo.test', 'Carlos Almeida',   'engenharia'::app_role,  null::uuid),
      ('gerencia@demo.test',   'Patricia Moraes',  'gerencia'::app_role,    null::uuid)
    ) as t(email, nome, papel, contratado)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token,
      email_change_token_new, email_change,
      email_change_token_current, reauthentication_token
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
      'authenticated', v_servico.email, crypt('demo1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '', '', ''
    )
    returning id into v_meas;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_meas, v_meas::text,
      format('{"sub":"%s","email":"%s","email_verified":true}', v_meas, v_servico.email)::jsonb,
      'email', now(), now()
    );

    insert into profiles (id, full_name) values (v_meas, v_servico.nome);

    insert into memberships (user_id, company_id, role, contractor_id)
    values (v_meas, v_company, v_servico.papel, v_servico.contratado);
  end loop;

  raise notice 'Seed aplicado: empresa %, obra %', v_company, v_project;
end $$;


-- =========================================
-- MIGRATION: 029_faturamento_direto.sql
-- =========================================

/* Migration 029: NF da medição com XML e observação + Faturamento Direto.

   Parte 1 — NF ligada à medição (continua exigindo aprovação final da cadeia):
   - invoices.notes: observação opcional do empreiteiro
   - submit_invoice ganha p_notes
   - get_pending_invoices devolve a observação

   Parte 2 — Faturamento Direto (NF de material ou outro faturamento sem medição):
   Empreiteiro -> Engenharia -> Administrativo. Não passa por Coordenação/Gerência.
   Fica em tabela própria, com histórico próprio, para nunca se misturar à medição.
*/

-- ---------------------------------------------------------------- Parte 1

alter table invoices add column if not exists notes text;

drop function if exists submit_invoice(uuid, text, date, numeric, text, text);

create function submit_invoice(
  p_measurement_id uuid,
  p_number         text,
  p_issued_on      date,
  p_amount         numeric,
  p_pdf            text default null,
  p_xml            text default null,
  p_notes          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    measurement_status;
  v_company   uuid;
  v_contract  uuid;
  v_approved  numeric;
  v_tolerance numeric;
  v_id        uuid;
begin
  if p_number is null or trim(p_number) = '' then
    raise exception 'O numero da nota fiscal e obrigatorio.';
  end if;

  if p_issued_on is null then
    raise exception 'A data de emissao e obrigatoria.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da nota fiscal deve ser positivo.';
  end if;

  select m.status, m.company_id, m.contract_id, p.invoice_tolerance
    into v_status, v_company, v_contract, v_tolerance
  from measurements m
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada para este contrato.';
  end if;

  if v_status <> 'APROVADA' then
    raise exception 'A nota fiscal so pode ser enviada para medicao aprovada (status atual: %).',
      v_status;
  end if;

  v_approved := measurement_total(p_measurement_id, true);

  if abs(p_amount - v_approved) > v_tolerance then
    raise exception
      'Valor da nota (%) diverge do valor aprovado (%). Diferenca aceita: %.',
      p_amount, v_approved, v_tolerance
      using errcode = 'check_violation';
  end if;

  insert into invoices
    (company_id, measurement_id, number, issued_on, amount, pdf_path, xml_path, notes, status)
  values
    (v_company, p_measurement_id, trim(p_number), p_issued_on, p_amount, p_pdf, p_xml,
     nullif(trim(coalesce(p_notes, '')), ''), 'RECEBIDA')
  on conflict (measurement_id, number) do update
    set issued_on = excluded.issued_on,
        amount    = excluded.amount,
        pdf_path  = excluded.pdf_path,
        xml_path  = excluded.xml_path,
        notes     = excluded.notes,
        status    = 'RECEBIDA'
  returning id into v_id;

  update measurements
  set status = 'NF_ENVIADA', version = version + 1
  where id = p_measurement_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, p_measurement_id, auth.uid(), 'NF_ENVIADA', 'invoice', v_id, p_amount::text);

  return v_id;
end $$;

drop function if exists get_pending_invoices();

create function get_pending_invoices()
returns table (
  measurement_id     uuid,
  invoice_id         uuid,
  protocol           text,
  contractor_name    text,
  project_name       text,
  competence         date,
  measurement_status measurement_status,
  invoice_number     text,
  invoice_issued_on  date,
  invoice_amount     numeric,
  approved_amount    numeric,
  invoice_status     invoice_status,
  pdf_path           text,
  xml_path           text,
  notes              text,
  submitted_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, i.id, m.protocol, c.name, p.name, mp.competence, m.status,
    i.number, i.issued_on, i.amount, measurement_total(m.id, true), i.status,
    i.pdf_path, i.xml_path, i.notes, i.created_at
  from invoices i
  join measurements m on m.id = i.measurement_id
  join contracts ct on ct.id = m.contract_id
  join contractors c on c.id = ct.contractor_id
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.company_id in (select auth_company_ids())
    and m.status in ('NF_ENVIADA', 'NF_APROVADA')
    and i.status in ('RECEBIDA', 'EM_CONFERENCIA', 'APROVADA')
  order by i.created_at desc;
$$;

-- ---------------------------------------------------------------- Parte 2

create type direct_billing_status as enum (
  'RASCUNHO', 'ENVIADO', 'AGUARDANDO_ENGENHARIA', 'DEVOLVIDO', 'APROVADO', 'PAGO'
);

create sequence direct_billing_protocol_seq;

create table direct_billings (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  contract_id      uuid not null references contracts(id) on delete cascade,
  protocol         text not null unique,
  billing_type     text not null
                   check (billing_type in ('MATERIAL', 'SERVICO_AVULSO', 'LOCACAO', 'OUTRO')),
  number           text not null,
  issued_on        date not null,
  amount           numeric(14,4) not null check (amount > 0),
  description      text not null check (length(trim(description)) > 0),
  notes            text,
  pdf_path         text,
  xml_path         text,
  status           direct_billing_status not null default 'RASCUNHO',
  return_reason    text,
  submitted_by     uuid references auth.users(id),
  submitted_at     timestamptz,
  approved_by      uuid references auth.users(id),
  approved_at      timestamptz,
  sent_to_admin_at timestamptz,
  paid_by          uuid references auth.users(id),
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (contract_id, number),
  check (pdf_path is not null or xml_path is not null)
);

create index direct_billings_contract_idx on direct_billings (contract_id, created_at desc);
create index direct_billings_status_idx on direct_billings (company_id, status);

/* Histórico próprio do Faturamento Direto: separado do audit_log da medição. */
create table direct_billing_events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  direct_billing_id uuid not null references direct_billings(id) on delete cascade,
  actor_id          uuid,
  action            text not null,
  status_to         direct_billing_status,
  reason            text,
  created_at        timestamptz not null default clock_timestamp()
);

create index direct_billing_events_idx on direct_billing_events (direct_billing_id, created_at);

alter table direct_billings       enable row level security;
alter table direct_billing_events enable row level security;

-- Somente leitura via RLS; toda escrita passa pelas funções abaixo.
create policy direct_billings_select on direct_billings for select
  using (can_read_contract(contract_id));

create policy direct_billing_events_select on direct_billing_events for select
  using (direct_billing_id in (select id from direct_billings where can_read_contract(contract_id)));

/* Envia (ou reenvia, após devolução) um Faturamento Direto.
   p_id nulo cria um novo; preenchido, corrige um DEVOLVIDO ou RASCUNHO. */
create or replace function submit_direct_billing(
  p_id          uuid,
  p_contract_id uuid,
  p_type        text,
  p_number      text,
  p_issued_on   date,
  p_amount      numeric,
  p_description text,
  p_notes       text default null,
  p_pdf         text default null,
  p_xml         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract record;
  v_current  record;
  v_id       uuid;
  v_action   text;
  v_users    uuid[];
begin
  if p_number is null or trim(p_number) = '' then
    raise exception 'O numero da nota fiscal e obrigatorio.';
  end if;
  if p_issued_on is null then
    raise exception 'A data de emissao e obrigatoria.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor da nota fiscal deve ser maior que zero.';
  end if;
  if p_description is null or trim(p_description) = '' then
    raise exception 'A descricao/justificativa e obrigatoria.';
  end if;
  if p_type is null or p_type not in ('MATERIAL', 'SERVICO_AVULSO', 'LOCACAO', 'OUTRO') then
    raise exception 'Tipo de faturamento invalido.';
  end if;

  select c.id, c.company_id, c.project_id, c.contractor_id
    into v_contract
  from contracts c where c.id = p_contract_id;

  if v_contract.id is null then
    raise exception 'Contrato nao encontrado.';
  end if;

  -- Só o próprio empreiteiro do contrato envia faturamento direto.
  if auth.uid() is not null and not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = v_contract.company_id
      and contractor_id = v_contract.contractor_id
  ) then
    raise exception 'Somente o empreiteiro do contrato pode enviar faturamento direto.';
  end if;

  if p_id is null then
    if p_pdf is null and p_xml is null then
      raise exception 'Anexe a nota fiscal (PDF ou XML).';
    end if;

    insert into direct_billings
      (company_id, project_id, contract_id, protocol, billing_type, number, issued_on,
       amount, description, notes, pdf_path, xml_path, status, submitted_by, submitted_at)
    values
      (v_contract.company_id, v_contract.project_id, p_contract_id,
       'FD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('direct_billing_protocol_seq')::text, 4, '0'),
       p_type, trim(p_number), p_issued_on, p_amount, trim(p_description),
       nullif(trim(coalesce(p_notes, '')), ''), p_pdf, p_xml,
       'AGUARDANDO_ENGENHARIA', auth.uid(), now())
    returning id into v_id;
    v_action := 'ENVIADO';
  else
    select * into v_current from direct_billings where id = p_id;
    if v_current.id is null or v_current.contract_id <> p_contract_id then
      raise exception 'Faturamento direto nao encontrado.';
    end if;
    if v_current.status not in ('DEVOLVIDO', 'RASCUNHO') then
      raise exception 'Faturamento direto nao pode ser alterado no status %.', v_current.status;
    end if;

    update direct_billings
    set billing_type  = p_type,
        number        = trim(p_number),
        issued_on     = p_issued_on,
        amount        = p_amount,
        description   = trim(p_description),
        notes         = nullif(trim(coalesce(p_notes, '')), ''),
        pdf_path      = coalesce(p_pdf, pdf_path),
        xml_path      = coalesce(p_xml, xml_path),
        status        = 'AGUARDANDO_ENGENHARIA',
        return_reason = null,
        submitted_by  = auth.uid(),
        submitted_at  = now(),
        updated_at    = now()
    where id = p_id;
    v_id := p_id;
    v_action := case when v_current.status = 'DEVOLVIDO' then 'REENVIADO' else 'ENVIADO' end;
  end if;

  insert into direct_billing_events (company_id, direct_billing_id, actor_id, action, status_to)
  values (v_contract.company_id, v_id, auth.uid(), v_action, 'AGUARDANDO_ENGENHARIA');

  v_users := usuarios_da_construtora(v_contract.company_id, array['engenharia', 'admin']::app_role[]);
  perform notificar(v_contract.company_id, v_users, 'FD_RECEBIDO',
    'Faturamento direto aguardando aprovação',
    'NF ' || trim(p_number) || ' — ' || trim(p_description),
    null, '/analise/faturamento-direto/' || v_id);

  return v_id;
end $$;

create or replace function approve_direct_billing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fd record;
begin
  select * into v_fd from direct_billings where id = p_id;
  if v_fd.id is null then
    raise exception 'Faturamento direto nao encontrado.';
  end if;

  if auth.uid() is not null and not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = v_fd.company_id
      and contractor_id is null
      and role in ('engenharia', 'admin')
      and (project_id is null or project_id = v_fd.project_id)
  ) then
    raise exception 'Somente a engenharia da obra pode aprovar faturamento direto.';
  end if;

  if v_fd.status <> 'AGUARDANDO_ENGENHARIA' then
    raise exception 'Faturamento direto nao esta aguardando engenharia (status atual: %).', v_fd.status;
  end if;

  update direct_billings
  set status = 'APROVADO', approved_by = auth.uid(), approved_at = now(),
      sent_to_admin_at = now(), updated_at = now()
  where id = p_id;

  insert into direct_billing_events (company_id, direct_billing_id, actor_id, action, status_to)
  values (v_fd.company_id, p_id, auth.uid(), 'APROVADO_ENGENHARIA', 'APROVADO'),
         (v_fd.company_id, p_id, auth.uid(), 'ENVIADO_ADMINISTRATIVO', 'APROVADO');

  perform notificar(v_fd.company_id,
    usuarios_do_contratado(v_fd.company_id, (select contractor_id from contracts where id = v_fd.contract_id)),
    'FD_APROVADO', 'Faturamento direto aprovado',
    v_fd.protocol || ' — NF ' || v_fd.number || ' seguiu para o Administrativo.',
    null, '/faturamento-direto/' || p_id);

  perform notificar(v_fd.company_id,
    usuarios_da_construtora(v_fd.company_id, array['financeiro', 'gerencia', 'admin']::app_role[]),
    'NF_RECEBIDA', 'NF de faturamento direto liberada',
    v_fd.protocol || ' — NF ' || v_fd.number || ' aprovada pela engenharia.',
    null, '/faturamento');
end $$;

create or replace function return_direct_billing(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fd record;
begin
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A devolucao exige uma justificativa.';
  end if;

  select * into v_fd from direct_billings where id = p_id;
  if v_fd.id is null then
    raise exception 'Faturamento direto nao encontrado.';
  end if;

  if auth.uid() is not null and not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = v_fd.company_id
      and contractor_id is null
      and role in ('engenharia', 'admin')
      and (project_id is null or project_id = v_fd.project_id)
  ) then
    raise exception 'Somente a engenharia da obra pode devolver faturamento direto.';
  end if;

  if v_fd.status <> 'AGUARDANDO_ENGENHARIA' then
    raise exception 'Faturamento direto nao esta aguardando engenharia (status atual: %).', v_fd.status;
  end if;

  update direct_billings
  set status = 'DEVOLVIDO', return_reason = trim(p_reason), updated_at = now()
  where id = p_id;

  insert into direct_billing_events (company_id, direct_billing_id, actor_id, action, status_to, reason)
  values (v_fd.company_id, p_id, auth.uid(), 'DEVOLVIDO', 'DEVOLVIDO', trim(p_reason));

  perform notificar(v_fd.company_id,
    usuarios_do_contratado(v_fd.company_id, (select contractor_id from contracts where id = v_fd.contract_id)),
    'FD_DEVOLVIDO', 'Faturamento direto devolvido para correção',
    trim(p_reason), null, '/faturamento-direto/' || p_id);
end $$;

create or replace function pay_direct_billing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fd record;
begin
  select * into v_fd from direct_billings where id = p_id;
  if v_fd.id is null then
    raise exception 'Faturamento direto nao encontrado.';
  end if;

  if auth.uid() is not null and not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = v_fd.company_id
      and contractor_id is null
      and role in ('admin', 'gerencia', 'financeiro')
  ) then
    raise exception 'Usuario sem permissao para registrar pagamento.';
  end if;

  if v_fd.status <> 'APROVADO' then
    raise exception 'Faturamento direto precisa estar aprovado pela engenharia (status atual: %).', v_fd.status;
  end if;

  update direct_billings
  set status = 'PAGO', paid_by = auth.uid(), paid_at = now(), updated_at = now()
  where id = p_id;

  insert into direct_billing_events (company_id, direct_billing_id, actor_id, action, status_to)
  values (v_fd.company_id, p_id, auth.uid(), 'PAGO', 'PAGO');

  perform notificar(v_fd.company_id,
    usuarios_do_contratado(v_fd.company_id, (select contractor_id from contracts where id = v_fd.contract_id)),
    'PAGAMENTO', 'Faturamento direto pago',
    v_fd.protocol || ' — NF ' || v_fd.number, null, '/faturamento-direto/' || p_id);
end $$;

/* Lista o que o usuário enxerga (empreiteiro: os próprios; construtora: a empresa). */
create or replace function list_direct_billings(p_statuses direct_billing_status[] default null)
returns table (
  id              uuid,
  protocol        text,
  billing_type    text,
  number          text,
  issued_on       date,
  amount          numeric,
  description     text,
  status          direct_billing_status,
  return_reason   text,
  contractor_name text,
  project_name    text,
  contract_number text,
  pdf_path        text,
  xml_path        text,
  notes           text,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  paid_at         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.protocol, d.billing_type, d.number, d.issued_on, d.amount, d.description,
         d.status, d.return_reason, ctr.name, p.name, c.number, d.pdf_path, d.xml_path,
         d.notes, d.submitted_at, d.approved_at, d.paid_at
  from direct_billings d
  join contracts c on c.id = d.contract_id
  join contractors ctr on ctr.id = c.contractor_id
  join projects p on p.id = d.project_id
  where can_read_contract(d.contract_id)
    and (p_statuses is null or d.status = any(p_statuses))
  order by coalesce(d.submitted_at, d.created_at) desc;
$$;

/* Detalhe + histórico com o nome de quem agiu. */
create or replace function get_direct_billing(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', d.id, 'protocol', d.protocol, 'billingType', d.billing_type,
    'number', d.number, 'issuedOn', d.issued_on, 'amount', d.amount,
    'description', d.description, 'notes', d.notes, 'status', d.status,
    'returnReason', d.return_reason, 'pdfPath', d.pdf_path, 'xmlPath', d.xml_path,
    'companyId', d.company_id, 'contractId', d.contract_id,
    'contractorName', ctr.name, 'projectName', p.name, 'contractNumber', c.number,
    'submittedAt', d.submitted_at, 'approvedAt', d.approved_at,
    'sentToAdminAt', d.sent_to_admin_at, 'paidAt', d.paid_at,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', e.action, 'statusTo', e.status_to, 'reason', e.reason,
        'createdAt', e.created_at, 'actorName', coalesce(pr.full_name, 'Sistema')
      ) order by e.created_at)
      from direct_billing_events e
      left join profiles pr on pr.id = e.actor_id
      where e.direct_billing_id = d.id
    ), '[]'::jsonb)
  )
  from direct_billings d
  join contracts c on c.id = d.contract_id
  join contractors ctr on ctr.id = c.contractor_id
  join projects p on p.id = d.project_id
  where d.id = p_id and can_read_contract(d.contract_id);
$$;

-- =========================================
-- MIGRATION: 030_pendentes_envio_medicao.sql
-- =========================================

/* Migration 030: pendências de envio de medição para o painel da engenharia.

   Para cada contrato das obras que o usuário da construtora acompanha, diz se
   o empreiteiro já enviou a medição da competência atual da obra.

   Competência atual = o período mais recente da obra que já abriu
   (aberto agora ou, se nenhum estiver aberto, o último que abriu).
   "Enviou" = existe medição desse período que já saiu do rascunho
   (EM_ANALISE, DEVOLVIDA, APROVADA, NF_*, PAGA). Rascunho ou nada = pendente.
   Não há vínculo engenheiro x empreiteiro no banco: vale o alcance por obra
   (memberships.project_id nulo = todas as obras da empresa). */

create or replace function get_measurement_submission_status()
returns table (
  contract_id      uuid,
  contract_number  text,
  contractor_id    uuid,
  contractor_name  text,
  project_id       uuid,
  project_name     text,
  competence       date,
  closes_at        timestamptz,
  period_open      boolean,
  sent             boolean,
  measurement_id   uuid,
  measurement_status measurement_status
)
language sql
stable
security definer
set search_path = public
as $$
  with periodo_atual as (
    select distinct on (mp.project_id)
      mp.id, mp.project_id, mp.competence, mp.closes_at,
      (now() between mp.opens_at and mp.closes_at) as aberto
    from measurement_periods mp
    where mp.opens_at <= now()
    order by mp.project_id, mp.competence desc
  )
  select
    c.id, c.number, ct.id, ct.name, pr.id, pr.name,
    pa.competence, pa.closes_at, pa.aberto,
    (m.id is not null and m.status not in ('RASCUNHO', 'CANCELADA')) as sent,
    m.id, m.status
  from contracts c
  join contractors ct    on ct.id = c.contractor_id
  join projects pr       on pr.id = c.project_id
  join periodo_atual pa  on pa.project_id = c.project_id
  left join lateral (
    select m2.id, m2.status
    from measurements m2
    where m2.contract_id = c.id
      and m2.period_id = pa.id
      and m2.status <> 'CANCELADA'
    order by m2.created_at desc
    limit 1
  ) m on true
  where exists (
    select 1 from memberships mem
    where mem.user_id = auth.uid()
      and mem.company_id = c.company_id
      and mem.contractor_id is null
      and (mem.project_id is null or mem.project_id = c.project_id)
  )
  order by sent, ct.name;
$$;

-- =========================================
-- MIGRATION: 031_cobrar_envio_medicao.sql
-- =========================================

/* Migration 031: botão "Cobrar envio" do painel da engenharia.
   Manda um aviso aos usuários do empreiteiro lembrando de enviar a medição
   da competência atual. Só a equipe da construtora com acesso à obra cobra. */

create or replace function cobrar_envio_medicao(p_contract_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract record;
  v_competence date;
  v_closes timestamptz;
  v_users uuid[];
begin
  select c.id, c.company_id, c.project_id, c.contractor_id
    into v_contract
  from contracts c where c.id = p_contract_id;

  if v_contract.id is null then
    raise exception 'Contrato nao encontrado.';
  end if;

  if auth.uid() is not null and not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = v_contract.company_id
      and contractor_id is null
      and (project_id is null or project_id = v_contract.project_id)
  ) then
    raise exception 'Somente a construtora pode cobrar o envio da medicao.';
  end if;

  select mp.competence, mp.closes_at into v_competence, v_closes
  from measurement_periods mp
  where mp.project_id = v_contract.project_id and mp.opens_at <= now()
  order by mp.competence desc
  limit 1;

  v_users := usuarios_do_contratado(v_contract.company_id, v_contract.contractor_id);

  return notificar(
    v_contract.company_id, v_users, 'COBRANCA_ENVIO',
    'A engenharia está aguardando sua medição',
    'Envie a medição de ' || to_char(v_competence, 'MM/YYYY')
      || case when v_closes > now()
              then ' até ' || to_char(v_closes at time zone 'America/Sao_Paulo', 'DD/MM')
              else ' (prazo encerrado em ' || to_char(v_closes at time zone 'America/Sao_Paulo', 'DD/MM') || ')'
         end || '.',
    null, '/medicao');
end $$;
