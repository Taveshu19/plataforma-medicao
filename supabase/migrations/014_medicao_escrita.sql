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
