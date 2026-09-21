/* Correcoes de saldo encontradas na revisao da Task 6.
   Nenhuma migration anterior foi editada; esta camada substitui a funcao e
   o trigger de 006 via CREATE OR REPLACE / DROP+CREATE TRIGGER.

   1) FURO CRITICO: o trigger de 006 vive em measurement_items e so
      revalida o saldo quando um ITEM e inserido/alterado. Uma medicao
      podia ser criada como RASCUNHO (nao consome), receber itens ate o
      limite do contrato, e so DEPOIS ter seu status trocado para
      EM_ANALISE/APROVADA/etc via UPDATE em measurements.status -- update
      que nao toca measurement_items e portanto nao disparava nenhuma
      checagem. Duas medicoes assim, cada uma com a quantidade cheia do
      item, promovidas em sequencia, furavam o saldo sem passar por
      nenhum caminho bloqueado. Corrigido com um trigger novo em
      measurements, que revalida todos os itens da medicao quando ela
      entra numa lista de status que consome e nao vinha de uma.

   2) Corrida entre duas transacoes concorrentes: sem lock, duas sessoes
      inserindo/promovendo ao mesmo tempo nao se enxergam sob READ
      COMMITTED e as duas passam. Corrigido com
      `select ... for update` na linha do contract_item antes de
      calcular o saldo, em ambos os triggers -- serializa quem disputa o
      mesmo item.

   3) O trigger de measurement_items so disparava em
      `update of qty_requested, qty_approved`. Um UPDATE trocando
      contract_item_id (ou measurement_id) nao disparava a checagem.
      Corrigido removendo a lista de colunas: o trigger agora dispara em
      qualquer INSERT/UPDATE na linha.

   4) Nada validava que o contract_item pertence ao contrato da medicao.
      Corrigido com uma checagem explicita em enforce_item_balance().

   5) contract_item_balance() era invoker-rights lendo tabelas com RLS.
      Alinhado ao padrao de can_read_contract() (003): security definer
      + search_path fixo.

   6) Mensagem de erro: trim(trailing '0' ...) so funcionava por
      coincidencia de formatacao. Trocado por trim_scale(), que e
      garantido pelo tipo numeric. */

create or replace function contract_item_balance(
  p_item_id uuid,
  p_exclude_measurement uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select ci.quantity - coalesce((
    select sum(coalesce(mi.qty_approved, mi.qty_requested))
    from measurement_items mi
    join measurements m on m.id = mi.measurement_id
    where mi.contract_item_id = ci.id
      and m.status in ('EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA')
      and (p_exclude_measurement is null or m.id <> p_exclude_measurement)
  ), 0)
  from contract_items ci
  where ci.id = p_item_id
$$;

create or replace function enforce_item_balance()
returns trigger
language plpgsql
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

  -- trava a linha do item: serializa disputas concorrentes pelo mesmo
  -- saldo e nos da os dados do item para validar o contrato e compor a
  -- mensagem de erro.
  select contract_id, service_name into v_item_contract, v_service_name
  from contract_items
  where id = new.contract_item_id
  for update;

  if v_item_contract is distinct from v_contract_id then
    raise exception
      'O item medido nao pertence ao contrato desta medicao.'
      using errcode = 'foreign_key_violation';
  end if;

  -- medicao morta nao disputa saldo
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

-- dispara em qualquer insert/update na linha (item 3 da revisao): trocar
-- contract_item_id ou measurement_id tambem precisa revalidar o saldo.
drop trigger if exists measurement_items_balance on measurement_items;
create trigger measurement_items_balance
  before insert or update on measurement_items
  for each row execute function enforce_item_balance();

/* Revalida o saldo de TODOS os itens de uma medicao quando ela entra
   numa lista de status que consome saldo vindo de um status que nao
   consumia. Transicoes entre dois status que ja consomem (ex.:
   EM_ANALISE -> APROVADA) nao precisam de revalidacao: o consumo do
   item nao muda so por causa dessa transicao. */
create or replace function enforce_measurement_transition_balance()
returns trigger
language plpgsql
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
      -- mesma trava usada em enforce_item_balance: serializa transicoes
      -- concorrentes disputando o saldo do mesmo item.
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

drop trigger if exists measurements_balance_on_transition on measurements;
create trigger measurements_balance_on_transition
  before update of status on measurements
  for each row execute function enforce_measurement_transition_balance();
