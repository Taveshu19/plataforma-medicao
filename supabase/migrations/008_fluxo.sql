create table approval_levels (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  level      int not null check (level >= 1),
  label      text not null,
  role       app_role not null,
  unique (project_id, level)
);

alter table approval_levels enable row level security;

create policy approval_levels_select on approval_levels for select
  using (project_id in (select auth_project_ids()));

create or replace function submit_measurement(p_measurement_id uuid)
returns text
language plpgsql
as $$
declare
  v_status     measurement_status;
  v_protocol   text;
  v_items      int;
  v_project    uuid;
  v_competence date;
begin
  select status, protocol into v_status, v_protocol
  from measurements where id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Medicao nao pode ser enviada no status %.', v_status;
  end if;

  select count(*) into v_items
  from measurement_items where measurement_id = p_measurement_id;

  if v_items = 0 then
    raise exception 'Medicao sem nenhum item preenchido.';
  end if;

  -- lock consultivo por obra e competencia para serializar geracao concorrente de protocolo
  select p.project_id, p.competence
    into v_project, v_competence
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  perform pg_advisory_xact_lock(hashtext(v_project::text), hashtext(v_competence::text));

  -- protocolo nasce no primeiro envio e sobrevive a devolucoes
  if v_protocol is null then
    v_protocol := next_protocol(p_measurement_id);
  end if;

  update measurements
  set status        = 'EM_ANALISE',
      current_level = 1,
      protocol      = v_protocol,
      submitted_at  = coalesce(submitted_at, now()),
      version       = version + 1
  where id = p_measurement_id;

  return v_protocol;
end $$;

create or replace function approve_measurement(p_measurement_id uuid)
returns measurement_status
language plpgsql
as $$
declare
  v_status    measurement_status;
  v_level     int;
  v_max_level int;
  v_new       measurement_status;
begin
  select m.status, m.current_level into v_status, v_level
  from measurements m where m.id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Medicao nao esta em analise (status atual: %).', v_status;
  end if;

  select max(al.level) into v_max_level
  from approval_levels al
  join measurements m        on m.id = p_measurement_id
  join measurement_periods p on p.id = m.period_id
  where al.project_id = p.project_id;

  if v_max_level is null then
    raise exception 'Obra sem niveis de aprovacao configurados.';
  end if;

  if v_level >= v_max_level then
    v_new := 'APROVADA';
    update measurements set status = v_new, current_level = v_max_level,
                            version = version + 1
    where id = p_measurement_id;
  else
    v_new := 'EM_ANALISE';
    update measurements set current_level = v_level + 1, version = version + 1
    where id = p_measurement_id;
  end if;

  return v_new;
end $$;

create or replace function return_measurement(p_measurement_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_status measurement_status;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A devolucao exige um motivo.';
  end if;

  select status into v_status from measurements where id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Somente medicao em analise pode ser devolvida (status atual: %).', v_status;
  end if;

  update measurements
  set status = 'DEVOLVIDA', current_level = 0, version = version + 1
  where id = p_measurement_id;
end $$;
