insert into storage.buckets (id, name, public)
values ('medicao-fotos', 'medicao-fotos', false),
       ('notas-fiscais', 'notas-fiscais', false),
       ('contratos-docs', 'contratos-docs', false)
on conflict (id) do nothing;

/* O primeiro segmento do caminho e sempre o company_id.
   Assim a RLS de storage reusa o mesmo isolamento das tabelas. */
create policy storage_select_own_company on storage.objects for select
  using (
    bucket_id in ('medicao-fotos', 'notas-fiscais', 'contratos-docs')
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );

create policy storage_insert_own_company on storage.objects for insert
  with check (
    bucket_id in ('medicao-fotos', 'notas-fiscais', 'contratos-docs')
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );
