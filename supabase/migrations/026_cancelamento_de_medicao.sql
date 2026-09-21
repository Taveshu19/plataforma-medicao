/* Cancelamento de medição.

   A máquina de estados previa `CANCELADA` desde a fundação e nenhuma tela
   chamava. Na prática não existia saída: uma medição aprovada com erro ficava
   aprovada para sempre, porque o desenho manda corrigir cancelando e
   refazendo — justamente para o histórico não virar ficção.

   Cancelar libera o saldo de volta: `contract_item_balance` não conta medição
   cancelada. E o índice parcial `measurements_one_active` exclui CANCELADA,
   então o par período/contrato volta a aceitar uma medição nova. */

create or replace function cancel_measurement(
  p_measurement_id uuid,
  p_reason         text
)
returns void
language plpgsql
/* security definer: grava em measurements e audit_log, que têm RLS sem
   política de escrita. A checagem de permissão está aqui dentro. */
security definer
set search_path to 'public'
as $$
declare
  v_company  uuid;
  v_contract uuid;
  v_status   measurement_status;
  v_protocol text;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'O cancelamento exige um motivo.';
  end if;

  select m.company_id, m.contract_id, m.status, m.protocol
    into v_company, v_contract, v_status, v_protocol
  from measurements m
  where m.id = p_measurement_id;

  if v_company is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  /* Cancelar e ato da construtora. O empreiteiro enxerga a propria medicao e,
     sem esta trava, poderia cancelar uma medicao ja aprovada para refazer com
     outro valor. */
  if auth.uid() is not null and not is_company_staff(v_company) then
    raise exception 'Apenas a equipe da construtora pode cancelar uma medicao.';
  end if;

  if v_status = 'CANCELADA' then
    raise exception 'Esta medicao ja esta cancelada.';
  end if;

  if v_status = 'PAGA' then
    raise exception 'Medicao ja paga nao pode ser cancelada. Trate como acerto no proximo periodo.';
  end if;

  update measurements
  set status = 'CANCELADA', version = version + 1
  where id = p_measurement_id;

  /* O protocolo morre com a medicao: next_protocol so conta medicoes com
     protocolo nao nulo, e a cancelada continua contando. Numero nao se
     reaproveita — e isso que sustenta a rastreabilidade. */

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id,
     old_value, new_value, reason)
  values
    (v_company, p_measurement_id, auth.uid(), 'CANCELADA', 'measurement',
     p_measurement_id, v_status::text, 'CANCELADA', trim(p_reason));
end $$;
