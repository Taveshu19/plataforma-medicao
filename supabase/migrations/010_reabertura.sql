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
