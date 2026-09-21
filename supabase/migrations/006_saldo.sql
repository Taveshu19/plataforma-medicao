/* Saldo de um item de contrato.
   Consomem saldo: EM_ANALISE, APROVADA, NF_ENVIADA, NF_APROVADA, PAGA.
   Nao consomem:   RASCUNHO, DEVOLVIDA, CANCELADA.
   Em medicao viva, vale o aprovado quando existir; senao, o solicitado. */
create or replace function contract_item_balance(
  p_item_id uuid,
  p_exclude_measurement uuid default null
)
returns numeric
language sql
stable
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
  v_status  measurement_status;
  v_qty     numeric;
  v_balance numeric;
begin
  select status into v_status from measurements where id = new.measurement_id;

  -- medicao morta nao disputa saldo
  if v_status = 'CANCELADA' then
    return new;
  end if;

  v_qty     := coalesce(new.qty_approved, new.qty_requested);
  v_balance := contract_item_balance(new.contract_item_id, new.measurement_id);

  if v_qty > v_balance then
    raise exception
      'Quantidade superior ao saldo disponivel. O maximo permitido e %.',
      trim(trailing '.' from trim(trailing '0' from v_balance::text))
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger measurement_items_balance
  before insert or update of qty_requested, qty_approved on measurement_items
  for each row execute function enforce_item_balance();
