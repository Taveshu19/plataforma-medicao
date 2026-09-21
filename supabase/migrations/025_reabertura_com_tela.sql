/* Reabertura de período: painel e trava de permissão.

   A função `reopen_period` existia desde a fundação e nenhuma tela chamava.
   Na prática, quem perdesse o dia 10 ficava sem solução — e em obra isso
   acontece todo mês.

   Duas coisas aqui:
   1. Uma consulta que mostra, para o período corrente, quem já enviou, quem
      não enviou e para quem o prazo foi reaberto.
   2. Uma trava: reabrir é ato da construtora. O empreiteiro enxerga o próprio
      contrato e, sem esta verificação, poderia reabrir o próprio prazo. */

/* Usuario e da equipe da construtora quando tem vinculo na empresa SEM
   contractor_id. Empreiteiro sempre tem contractor_id preenchido. */
create or replace function is_company_staff(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid()
      and m.company_id = p_company_id
      and m.contractor_id is null
  )
$$;

/* Situacao de cada empreiteiro no periodo: enviou? esta aberto para ele? */
create or replace function get_period_contractors_status(p_period_id uuid)
returns table (
  contractor_id      uuid,
  contractor_name    text,
  contract_id        uuid,
  contract_number    text,
  measurement_id     uuid,
  measurement_status text,
  protocol           text,
  period_open        boolean,
  reopened_until     timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_project uuid;
  v_company uuid;
begin
  select p.project_id, p.company_id into v_project, v_company
  from measurement_periods p where p.id = p_period_id;

  if v_project is null then
    return;
  end if;

  if auth.uid() is not null and not is_company_staff(v_company) then
    raise exception 'Apenas a equipe da construtora acessa o painel de prazos.';
  end if;

  return query
  select
    ct.id,
    ct.name,
    c.id,
    c.number,
    m.id,
    m.status::text,
    m.protocol,
    is_period_open(p_period_id, ct.id),
    (
      select max(r.reopened_until)
      from period_reopenings r
      where r.period_id = p_period_id and r.contractor_id = ct.id
    )
  from contracts c
  join contractors ct on ct.id = c.contractor_id
  left join measurements m
    on m.contract_id = c.id
   and m.period_id = p_period_id
   and m.status <> 'CANCELADA'
  where c.project_id = v_project
  order by ct.name;
end $$;

/* Mesma assinatura de antes, agora com a trava de permissao.
   A checagem so vale para chamada autenticada: o seed e os testes rodam
   como superusuario, com auth.uid() nulo. */
create or replace function reopen_period(
  p_period_id     uuid,
  p_contractor_id uuid,
  p_until         timestamptz,
  p_reason        text
)
returns uuid
language plpgsql
/* security definer: a funcao grava em period_reopenings e audit_log, que tem
   RLS sem policy de escrita. Ela faz a propria checagem de permissao acima —
   sem isto, um engenheiro legitimo levava "row violates row-level security". */
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_id      uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reabertura exige um motivo.';
  end if;

  if p_until <= now() then
    raise exception 'A reabertura precisa de uma data futura.';
  end if;

  select company_id into v_company from measurement_periods where id = p_period_id;
  if v_company is null then
    raise exception 'Periodo nao encontrado.';
  end if;

  if auth.uid() is not null and not is_company_staff(v_company) then
    raise exception 'Apenas a equipe da construtora pode reabrir um prazo.';
  end if;

  insert into period_reopenings
    (company_id, period_id, contractor_id, reopened_until, authorized_by, reason)
  values (v_company, p_period_id, p_contractor_id, p_until, auth.uid(), p_reason)
  returning id into v_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value, reason)
  values
    (v_company, null, auth.uid(), 'PERIODO_REABERTO', 'period_reopening', v_id,
     p_until::text, p_reason);

  return v_id;
end $$;
