/* Foto e observação por serviço na medição.

   O spec pede os dois como opcionais na tela de preenchimento, e a observação
   já trafegava até o espelho — faltava a tela coletar. A foto não existia de
   forma alguma: `attachments` só tinha política de leitura, então nada podia
   ser gravado por um usuário autenticado.

   A foto é a evidência que sustenta a conferência. Sem ela o engenheiro
   aprova no escuro, e a pergunta "por que 20 m²?" não tem resposta. */

/* O anexo aponta para o item DE CONTRATO, não para o item de medição.
   Motivo: o empreiteiro tira a foto antes de salvar a quantidade, e o
   measurement_item pode nem existir ainda. Amarrar no item de contrato
   permite anexar em qualquer ordem. */
alter table attachments
  add column if not exists contract_item_id uuid references contract_items(id) on delete cascade;

create index if not exists attachments_medicao_item_idx
  on attachments (measurement_id, contract_item_id);

/* Registra um anexo já enviado ao storage.
   O upload em si acontece na Server Action, que grava sob o caminho
   <company_id>/... — é isso que a policy de storage exige. */
create or replace function attach_measurement_file(
  p_measurement_id  uuid,
  p_contract_item_id uuid,
  p_bucket          text,
  p_path            text,
  p_mime_type       text,
  p_size_bytes      bigint
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company  uuid;
  v_contract uuid;
  v_status   measurement_status;
  v_id       uuid;
begin
  select m.company_id, m.contract_id, m.status
    into v_company, v_contract, v_status
  from measurements m
  where m.id = p_measurement_id;

  if v_company is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada.';
  end if;

  /* Mesma janela de edicao dos itens: depois de enviada, a medicao esta
     sob analise e as evidencias nao podem mais mudar. */
  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'A medicao nao aceita mais anexos no status %.', v_status;
  end if;

  if p_contract_item_id is not null and not exists (
    select 1 from contract_items ci
    where ci.id = p_contract_item_id and ci.contract_id = v_contract
  ) then
    raise exception 'O item nao pertence ao contrato desta medicao.';
  end if;

  insert into attachments
    (company_id, measurement_id, contract_item_id, bucket, path, mime_type, size_bytes)
  values
    (v_company, p_measurement_id, p_contract_item_id, p_bucket, p_path, p_mime_type, p_size_bytes)
  returning id into v_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, p_measurement_id, auth.uid(), 'ANEXO_ADICIONADO', 'attachment', v_id, p_path);

  return v_id;
end $$;

create or replace function remove_measurement_file(p_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company     uuid;
  v_measurement uuid;
  v_contract    uuid;
  v_status      measurement_status;
  v_path        text;
begin
  select a.company_id, a.measurement_id, a.path
    into v_company, v_measurement, v_path
  from attachments a
  where a.id = p_attachment_id;

  if v_company is null then
    raise exception 'Anexo nao encontrado.';
  end if;

  select m.contract_id, m.status into v_contract, v_status
  from measurements m where m.id = v_measurement;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'A medicao nao permite remover anexos no status %.', v_status;
  end if;

  delete from attachments where id = p_attachment_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, old_value)
  values
    (v_company, v_measurement, auth.uid(), 'ANEXO_REMOVIDO', 'attachment', p_attachment_id, v_path);
end $$;

/* Anexos de uma medicao, opcionalmente filtrados por item de contrato.
   Usada tanto pela tela do empreiteiro quanto pela analise da engenharia. */
create or replace function get_measurement_files(
  p_measurement_id uuid,
  p_contract_item_id uuid default null
)
returns table (
  id               uuid,
  contract_item_id uuid,
  bucket           text,
  path             text,
  mime_type        text,
  size_bytes       bigint,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_contract uuid;
begin
  select m.contract_id into v_contract from measurements m where m.id = p_measurement_id;

  if v_contract is null then
    return;
  end if;

  if auth.uid() is not null and not can_read_contract(v_contract) then
    raise exception 'Permissao negada.';
  end if;

  return query
  select a.id, a.contract_item_id, a.bucket, a.path, a.mime_type, a.size_bytes, a.created_at
  from attachments a
  where a.measurement_id = p_measurement_id
    and (p_contract_item_id is null or a.contract_item_id = p_contract_item_id)
  order by a.created_at;
end $$;
