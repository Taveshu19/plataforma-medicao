/* Notificações dentro do sistema.

   Três seções do spec (8, 9 e 44) tratam de avisar o empreiteiro: que a
   medição abriu, que o prazo está acabando, que foi devolvida, que foi
   aprovada, que o pagamento saiu. Nada disso existia — ele só entrava se
   lembrasse, e o engenheiro só sabia que chegou medição se fosse olhar.

   O que nasce de evento (enviada, devolvida, aprovada, NF, paga, cancelada)
   é gerado por gatilho, junto da mudança de status. O que depende de tempo
   (período abriu, prazo está perto) fica em funções prontas para um agendador
   chamar — sem agendador configurado elas simplesmente não são chamadas, e
   isso é melhor do que prometer aviso que não sai.

   E-mail não entra aqui: exige provedor com credencial. A tabela guarda
   `emailed_at` para que o envio possa ser plugado depois sem migrar de novo. */

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  measurement_id uuid references measurements(id) on delete cascade,
  kind           text not null,
  title          text not null,
  body           text,
  link           text,
  read_at        timestamptz,
  emailed_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index notifications_destinatario_idx
  on notifications (user_id, read_at, created_at desc);

alter table notifications enable row level security;

/* Cada um lê só as próprias. */
create policy notifications_select on notifications for select
  using (user_id = auth.uid());

/* Marcar como lida é a única escrita que o usuário faz, e só nas dele. */
create policy notifications_update_own on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

/* --- Destinatários ------------------------------------------------------ */

/* Usuarios vinculados a um empreiteiro especifico. */
create or replace function usuarios_do_contratado(p_company uuid, p_contractor uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from memberships m
  where m.company_id = p_company and m.contractor_id = p_contractor
$$;

/* Equipe da construtora: vinculo na empresa SEM contractor_id.
   Opcionalmente filtrada por papel, para a NF ir so ao financeiro. */
create or replace function usuarios_da_construtora(
  p_company uuid,
  p_roles app_role[] default null
)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct m.user_id), '{}')
  from memberships m
  where m.company_id = p_company
    and m.contractor_id is null
    and (p_roles is null or m.role = any(p_roles))
$$;

create or replace function notificar(
  p_company     uuid,
  p_users       uuid[],
  p_kind        text,
  p_title       text,
  p_body        text,
  p_measurement uuid default null,
  p_link        text default null
)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user  uuid;
  v_total int := 0;
begin
  if p_users is null then
    return 0;
  end if;

  foreach v_user in array p_users loop
    insert into notifications
      (company_id, user_id, measurement_id, kind, title, body, link)
    values
      (p_company, v_user, p_measurement, p_kind, p_title, p_body, p_link);
    v_total := v_total + 1;
  end loop;

  return v_total;
end $$;

/* --- Gatilho de eventos da medição -------------------------------------- */

create or replace function notify_measurement_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_contractor uuid;
  v_numero     text;
  v_protocolo  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select c.contractor_id, c.number into v_contractor, v_numero
  from contracts c where c.id = new.contract_id;

  v_protocolo := coalesce(new.protocol, 'sem protocolo');

  if new.status = 'EM_ANALISE' and old.status in ('RASCUNHO', 'DEVOLVIDA') then
    perform notificar(
      new.company_id,
      usuarios_da_construtora(new.company_id),
      'MEDICAO_RECEBIDA',
      'Medição recebida para análise',
      format('Contrato %s enviou a medição %s.', v_numero, v_protocolo),
      new.id,
      '/analise/' || new.id
    );

  elsif new.status = 'DEVOLVIDA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'MEDICAO_DEVOLVIDA',
      'Sua medição foi devolvida',
      format('A medição %s precisa de correção. Veja o motivo e reenvie.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'APROVADA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'MEDICAO_APROVADA',
      'Medição aprovada, pode emitir a nota',
      format('A medição %s foi aprovada. O faturamento está liberado.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'NF_ENVIADA' then
    perform notificar(
      new.company_id,
      usuarios_da_construtora(new.company_id, array['financeiro', 'gerencia', 'admin']::app_role[]),
      'NF_RECEBIDA',
      'Nota fiscal recebida',
      format('Contrato %s enviou a nota da medição %s.', v_numero, v_protocolo),
      new.id,
      '/faturamento'
    );

  elsif new.status = 'NF_APROVADA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'NF_APROVADA',
      'Sua nota fiscal foi aprovada',
      format('A nota da medição %s foi conferida e aprovada.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'PAGA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'PAGAMENTO',
      'Pagamento registrado',
      format('O pagamento da medição %s foi registrado.', v_protocolo),
      new.id,
      '/medicoes'
    );

  elsif new.status = 'CANCELADA' then
    perform notificar(
      new.company_id,
      usuarios_do_contratado(new.company_id, v_contractor),
      'MEDICAO_CANCELADA',
      'Medição cancelada',
      format('A medição %s foi cancelada pela construtora.', v_protocolo),
      new.id,
      '/medicoes'
    );
  end if;

  return new;
end $$;

create trigger measurements_notify
  after update of status on measurements
  for each row execute function notify_measurement_change();

/* --- Avisos que dependem de tempo --------------------------------------- */

/* Período abriu: avisa todos os empreiteiros com contrato na obra.
   Idempotente — chamar duas vezes no mesmo período não duplica o aviso. */
create or replace function notify_period_opened(p_period_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_project uuid;
  v_comp    date;
  v_fecha   timestamptz;
  v_total   int := 0;
  r         record;
begin
  select p.company_id, p.project_id, p.competence, p.closes_at
    into v_company, v_project, v_comp, v_fecha
  from measurement_periods p where p.id = p_period_id;

  if v_company is null then
    return 0;
  end if;

  for r in
    select distinct c.contractor_id
    from contracts c
    where c.project_id = v_project
  loop
    /* Nao repete o aviso para quem ja recebeu deste periodo. */
    if exists (
      select 1 from notifications n
      join memberships m on m.user_id = n.user_id
      where n.kind = 'PERIODO_ABERTO'
        and n.body like '%' || to_char(v_comp, 'MM/YYYY') || '%'
        and m.contractor_id = r.contractor_id
        and n.company_id = v_company
    ) then
      continue;
    end if;

    v_total := v_total + notificar(
      v_company,
      usuarios_do_contratado(v_company, r.contractor_id),
      'PERIODO_ABERTO',
      'Medição aberta',
      format('A medição de %s está disponível. O prazo termina em %s.',
             to_char(v_comp, 'MM/YYYY'), to_char(v_fecha, 'DD/MM/YYYY')),
      null,
      '/medicao'
    );
  end loop;

  return v_total;
end $$;

/* Prazo se aproximando: avisa so quem ainda NAO enviou.
   Feita para um agendador chamar uma vez por dia. */
create or replace function notify_deadline_approaching(p_period_id uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_project uuid;
  v_comp    date;
  v_fecha   timestamptz;
  v_dias    int;
  v_total   int := 0;
  r         record;
begin
  select p.company_id, p.project_id, p.competence, p.closes_at
    into v_company, v_project, v_comp, v_fecha
  from measurement_periods p where p.id = p_period_id;

  if v_company is null or v_fecha < now() then
    return 0;
  end if;

  v_dias := greatest(0, (v_fecha::date - current_date));

  for r in
    select c.contractor_id
    from contracts c
    left join measurements m
      on m.contract_id = c.id
     and m.period_id = p_period_id
     and m.status not in ('RASCUNHO', 'CANCELADA')
    where c.project_id = v_project
      and m.id is null
  loop
    v_total := v_total + notificar(
      v_company,
      usuarios_do_contratado(v_company, r.contractor_id),
      'PRAZO_PROXIMO',
      case when v_dias <= 1 then 'Último dia para enviar sua medição'
           else format('Faltam %s dias para o fim do prazo', v_dias) end,
      format('A medição de %s ainda não foi enviada. O prazo termina em %s.',
             to_char(v_comp, 'MM/YYYY'), to_char(v_fecha, 'DD/MM/YYYY')),
      null,
      '/medicao'
    );
  end loop;

  return v_total;
end $$;

/* Marcar como lida. A policy de update ja restringe ao dono. */
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total int;
begin
  if auth.uid() is null then
    return 0;
  end if;

  update notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any(p_ids));

  get diagnostics v_total = row_count;
  return v_total;
end $$;
