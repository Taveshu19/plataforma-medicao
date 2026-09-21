/* O financeiro informa quando pretende pagar.

   A trilha de status na tela inicial do empreiteiro mostra "pagamento previsto
   para dia X". Sem alguem informando essa data, a trilha exibiria uma promessa
   vazia. Quem sabe a data e o financeiro, no momento em que aprova a nota. */

create or replace function set_invoice_expected_payment(
  p_invoice_id uuid,
  p_expected_date date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_measurement uuid;
  v_company     uuid;
  v_status      invoice_status;
begin
  select i.measurement_id, i.company_id, i.status
    into v_measurement, v_company, v_status
  from invoices i
  where i.id = p_invoice_id;

  if v_measurement is null then
    raise exception 'Nota fiscal nao encontrada.';
  end if;

  -- Quem enxerga o contrato da medicao pode informar a previsao.
  -- O empreiteiro tambem enxerga, mas nao chega aqui: a tela e do financeiro.
  if auth.uid() is not null then
    if not exists (
      select 1 from measurements m
      where m.id = v_measurement and can_read_contract(m.contract_id)
    ) then
      raise exception 'Permissao negada.';
    end if;
  end if;

  if v_status = 'PAGA' then
    raise exception 'A nota ja foi paga; nao faz sentido prever pagamento.';
  end if;

  if p_expected_date is not null and p_expected_date < current_date then
    raise exception 'A data prevista de pagamento nao pode estar no passado.';
  end if;

  update invoices
  set expected_payment_date = p_expected_date
  where id = p_invoice_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, v_measurement, auth.uid(), 'PREVISAO_PAGAMENTO', 'invoice',
     p_invoice_id, p_expected_date::text);
end $$;
