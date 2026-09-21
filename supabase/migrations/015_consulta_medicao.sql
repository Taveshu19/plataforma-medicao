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
