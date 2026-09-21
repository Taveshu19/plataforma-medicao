/* Os quatro numeros da home do empreiteiro.
   Espelha a regra de saldo da migration 006, mas em valor em vez de quantidade:
   consomem APROVADA/NF_ENVIADA/NF_APROVADA/PAGA (como aprovado) e EM_ANALISE
   (como em aprovacao). RASCUNHO, DEVOLVIDA e CANCELADA nao entram.
   Em medicao viva vale o aprovado quando existir; senao, o solicitado. */
create or replace function contract_summary(p_contract_id uuid)
returns table (
  contracted numeric,
  approved   numeric,
  in_review  numeric,
  available  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with itens as (
    select id, quantity * unit_price as valor
    from contract_items
    where contract_id = p_contract_id
  ),
  consumo as (
    select
      coalesce(sum(
        case when m.status in ('APROVADA','NF_ENVIADA','NF_APROVADA','PAGA')
             then coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price
             else 0 end
      ), 0) as aprovado,
      coalesce(sum(
        case when m.status = 'EM_ANALISE'
             then coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price
             else 0 end
      ), 0) as em_analise
    from measurement_items mi
    join measurements m  on m.id = mi.measurement_id
    join contract_items ci on ci.id = mi.contract_item_id
    where ci.contract_id = p_contract_id
  )
  select
    coalesce((select sum(valor) from itens), 0)                                  as contracted,
    consumo.aprovado                                                              as approved,
    consumo.em_analise                                                            as in_review,
    coalesce((select sum(valor) from itens), 0) - consumo.aprovado - consumo.em_analise
                                                                                  as available
  from consumo
$$;
