/* Salva itens de medicao atomicamente (upsert para qty > 0, delete para qty <= 0). */

create or replace function save_measurement_items(
  p_measurement_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id  uuid;
  v_contract_id uuid;
  v_status      measurement_status;
  elem          jsonb;
  v_item_id     uuid;
  v_qty         numeric;
  v_notes       text;
begin
  select company_id, contract_id, status
    into v_company_id, v_contract_id, v_status
  from measurements
  where id = p_measurement_id;

  if v_company_id is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Medicao nao pode ser alterada no status %.', v_status;
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract_id) then
    raise exception 'Permissao negada.';
  end if;

  for elem in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := (elem->>'contract_item_id')::uuid;
    v_qty     := (elem->>'qty_requested')::numeric;
    v_notes   := elem->>'notes';

    if v_qty is null or v_qty <= 0 then
      delete from measurement_items
      where measurement_id = p_measurement_id
        and contract_item_id = v_item_id;
    else
      insert into measurement_items (
        company_id,
        measurement_id,
        contract_item_id,
        qty_requested,
        notes
      )
      values (
        v_company_id,
        p_measurement_id,
        v_item_id,
        v_qty,
        v_notes
      )
      on conflict (measurement_id, contract_item_id)
      do update set
        qty_requested = excluded.qty_requested,
        notes         = excluded.notes;
    end if;
  end loop;
end $$;
