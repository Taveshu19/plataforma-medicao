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
