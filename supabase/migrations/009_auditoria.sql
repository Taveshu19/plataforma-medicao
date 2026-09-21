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
