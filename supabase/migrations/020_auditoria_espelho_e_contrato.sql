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
