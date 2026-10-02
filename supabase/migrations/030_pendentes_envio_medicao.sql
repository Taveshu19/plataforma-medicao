/* Migration 030: pendências de envio de medição para o painel da engenharia.

   Para cada contrato das obras que o usuário da construtora acompanha, diz se
   o empreiteiro já enviou a medição da competência atual da obra.

   Competência atual = o período mais recente da obra que já abriu
   (aberto agora ou, se nenhum estiver aberto, o último que abriu).
   "Enviou" = existe medição desse período que já saiu do rascunho
   (EM_ANALISE, DEVOLVIDA, APROVADA, NF_*, PAGA). Rascunho ou nada = pendente.
   Não há vínculo engenheiro x empreiteiro no banco: vale o alcance por obra
   (memberships.project_id nulo = todas as obras da empresa). */

create or replace function get_measurement_submission_status()
returns table (
  contract_id      uuid,
  contract_number  text,
  contractor_id    uuid,
  contractor_name  text,
  project_id       uuid,
  project_name     text,
  competence       date,
  closes_at        timestamptz,
  period_open      boolean,
  sent             boolean,
  measurement_id   uuid,
  measurement_status measurement_status
)
language sql
stable
security definer
set search_path = public
as $$
  with periodo_atual as (
    select distinct on (mp.project_id)
      mp.id, mp.project_id, mp.competence, mp.closes_at,
      (now() between mp.opens_at and mp.closes_at) as aberto
    from measurement_periods mp
    where mp.opens_at <= now()
    order by mp.project_id, mp.competence desc
  )
  select
    c.id, c.number, ct.id, ct.name, pr.id, pr.name,
    pa.competence, pa.closes_at, pa.aberto,
    (m.id is not null and m.status not in ('RASCUNHO', 'CANCELADA')) as sent,
    m.id, m.status
  from contracts c
  join contractors ct    on ct.id = c.contractor_id
  join projects pr       on pr.id = c.project_id
  join periodo_atual pa  on pa.project_id = c.project_id
  left join lateral (
    select m2.id, m2.status
    from measurements m2
    where m2.contract_id = c.id
      and m2.period_id = pa.id
      and m2.status <> 'CANCELADA'
    order by m2.created_at desc
    limit 1
  ) m on true
  where exists (
    select 1 from memberships mem
    where mem.user_id = auth.uid()
      and mem.company_id = c.company_id
      and mem.contractor_id is null
      and (mem.project_id is null or mem.project_id = c.project_id)
  )
  order by sent, ct.name;
$$;
