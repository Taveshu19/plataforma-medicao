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
