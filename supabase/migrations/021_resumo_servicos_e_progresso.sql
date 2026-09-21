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
