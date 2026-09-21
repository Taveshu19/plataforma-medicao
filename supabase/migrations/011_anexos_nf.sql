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
