/* Correcao: can_read_contract() checava "este usuario e empreiteiro?" de forma
   global ao usuario, sem escopar por empresa. Um usuario que e engenheiro na
   Construtora A (membership com contractor_id nulo) e tambem empreiteiro na
   Construtora B (membership com contractor_id preenchido) perdia acesso aos
   contratos da propria Construtora A, porque o "not exists" global enxergava
   o vinculo de empreiteiro da B e o "auth_contractor_ids() in" comparava com
   o contractor_id da B, que nunca bate com contratos da A.

   A correcao escopa as duas subconsultas por c.company_id: o usuario so e
   tratado como "empreiteiro" dentro da empresa do contrato sendo avaliado. */
create or replace function can_read_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from contracts c
    where c.id = p_contract_id
      and c.project_id in (select auth_project_ids())
      and (
        -- nesta empresa o usuario nao atua como empreiteiro: ve todos os contratos
        not exists (
          select 1 from memberships m
          where m.user_id = auth.uid()
            and m.company_id = c.company_id
            and m.contractor_id is not null
        )
        -- ou atua como empreiteiro nesta empresa, e o contrato e dele
        or exists (
          select 1 from memberships m
          where m.user_id = auth.uid()
            and m.company_id = c.company_id
            and m.contractor_id = c.contractor_id
        )
      )
  )
$$;
