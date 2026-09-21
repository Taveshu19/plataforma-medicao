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
