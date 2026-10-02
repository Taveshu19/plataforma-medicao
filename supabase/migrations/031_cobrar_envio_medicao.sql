/* Migration 031: botão "Cobrar envio" do painel da engenharia.
   Manda um aviso aos usuários do empreiteiro lembrando de enviar a medição
   da competência atual. Só a equipe da construtora com acesso à obra cobra. */

create or replace function cobrar_envio_medicao(p_contract_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract record;
  v_competence date;
  v_closes timestamptz;
  v_users uuid[];
begin
  select c.id, c.company_id, c.project_id, c.contractor_id
    into v_contract
  from contracts c where c.id = p_contract_id;

  if v_contract.id is null then
    raise exception 'Contrato nao encontrado.';
  end if;

  if auth.uid() is not null and not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = v_contract.company_id
      and contractor_id is null
      and (project_id is null or project_id = v_contract.project_id)
  ) then
    raise exception 'Somente a construtora pode cobrar o envio da medicao.';
  end if;

  select mp.competence, mp.closes_at into v_competence, v_closes
  from measurement_periods mp
  where mp.project_id = v_contract.project_id and mp.opens_at <= now()
  order by mp.competence desc
  limit 1;

  v_users := usuarios_do_contratado(v_contract.company_id, v_contract.contractor_id);

  return notificar(
    v_contract.company_id, v_users, 'COBRANCA_ENVIO',
    'A engenharia está aguardando sua medição',
    'Envie a medição de ' || to_char(v_competence, 'MM/YYYY')
      || case when v_closes > now()
              then ' até ' || to_char(v_closes at time zone 'America/Sao_Paulo', 'DD/MM')
              else ' (prazo encerrado em ' || to_char(v_closes at time zone 'America/Sao_Paulo', 'DD/MM') || ')'
         end || '.',
    null, '/medicao');
end $$;
