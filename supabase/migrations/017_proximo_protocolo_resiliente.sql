/* Atualiza next_protocol para usar max() do sequencial em vez de count(),
   evitando colisoes caso sequenciais existam previamente ou tenham sido atribuidos. */

create or replace function next_protocol(p_measurement_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_competence date;
  v_project    uuid;
  v_seq        int;
begin
  select p.competence, p.project_id
    into v_competence, v_project
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  if v_competence is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  select coalesce(max(substring(m.protocol from '(\d+)$')::int), 0) + 1 into v_seq
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where p.project_id = v_project
    and p.competence = v_competence
    and m.protocol is not null;

  return 'MED-' || to_char(v_competence, 'YYYY-MM') || '-' || lpad(v_seq::text, 3, '0');
end $$;
