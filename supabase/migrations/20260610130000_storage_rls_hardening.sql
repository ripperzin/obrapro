-- ==============================================================================
-- MIGRATION: STORAGE RLS HARDENING
-- DATA: 2026-06-10
-- ==============================================================================
-- Fecha a pendência deixada por 20260609120000_rls_hardening.sql: o Storage.
--
-- Estado anterior (INSEGURO) nos buckets 'project-documents' e
-- 'expense-attachments':
--   * policy SELECT `to anon using (bucket_id = ...)` -> QUALQUER pessoa com a
--     chave anônima baixava TODOS os arquivos de TODOS os clientes.
--   * policy SELECT/INSERT/DELETE `to authenticated using (bucket_id = ...)` sem
--     escopo -> qualquer usuário logado baixava arquivos de qualquer obra.
--
-- Estratégia (NÃO move nenhum arquivo -> zero perda de dados):
--   Os caminhos legados são "docs/<arquivo>" e "expenses/<arquivo>" (sem
--   project_id). Em vez de reorganizar o bucket, escopamos o acesso pelo
--   REGISTRO do banco que referencia o arquivo: se existe um document/diary/
--   evidence/expense apontando para o objeto e o usuário pode acessar AQUELA
--   obra (can_access_project), ele pode ler/baixar. Quem subiu o arquivo
--   (storage.objects.owner) também lê — cobre o preview imediato pós-upload,
--   antes do registro ser salvo.
--
--   O Portal do Investidor (anon) NÃO acessa mais o Storage diretamente: a edge
--   function `investor-portal` (service role, ignora RLS) gera as signed URLs e
--   as devolve prontas. Por isso removemos TODA policy `anon`.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. HELPER: o objeto de storage está referenciado por um registro de uma obra
--    que o usuário pode acessar? SECURITY DEFINER -> ignora a RLS das tabelas
--    de domínio (evita recursão e custo), decidindo só pelo project_id.
-- ------------------------------------------------------------------------------
create or replace function public.can_access_storage_object(p_bucket text, p_name text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select case p_bucket
    when 'project-documents' then exists (
      select 1 from public.documents d
      where d.url = p_name and public.can_access_project(d.project_id)
    ) or exists (
      select 1 from public.diary_entries de
      where p_name = any(de.photos) and public.can_access_project(de.project_id)
    ) or exists (
      select 1 from public.stage_evidences se
      where p_name = any(se.photos) and public.can_access_project(se.project_id)
    )
    when 'expense-attachments' then exists (
      select 1 from public.expenses e
      where (p_name = e.attachment_url or p_name = any(e.attachments))
        and public.can_access_project(e.project_id)
    )
    else false
  end;
$$;

-- ------------------------------------------------------------------------------
-- 2. LIMPEZA: derruba toda policy em storage.objects que mencione um destes dois
--    buckets (não confiamos nos nomes; há scripts soltos e edições via painel).
--    Outros buckets ficam intactos.
-- ------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (
        coalesce(qual, '')       like '%project-documents%'
        or coalesce(qual, '')       like '%expense-attachments%'
        or coalesce(with_check, '') like '%project-documents%'
        or coalesce(with_check, '') like '%expense-attachments%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- 3. POLICIES NOVAS (somente `authenticated`; nenhuma para `anon`).
-- ------------------------------------------------------------------------------

-- Leitura/geração de signed URL: dono do objeto OU obra acessível via registro.
create policy "obrapro_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('project-documents', 'expense-attachments')
    and (
      owner = auth.uid()
      or public.can_access_storage_object(bucket_id, name)
    )
  );

-- Upload: qualquer usuário logado pode subir nestes buckets. (Não é vazamento:
-- subir arquivo não dá acesso ao de ninguém; a leitura é que é escopada acima.)
create policy "obrapro_storage_insert"
  on storage.objects for insert to authenticated
  with check ( bucket_id in ('project-documents', 'expense-attachments') );

-- Exclusão: dono do objeto OU membro da obra que referencia o arquivo.
create policy "obrapro_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('project-documents', 'expense-attachments')
    and (
      owner = auth.uid()
      or public.can_access_storage_object(bucket_id, name)
    )
  );

-- ------------------------------------------------------------------------------
-- 4. Garante que os buckets sejam privados (defesa em profundidade: mesmo que
--    uma policy falhe, sem URL assinada não há acesso público).
-- ------------------------------------------------------------------------------
update storage.buckets set public = false
where id in ('project-documents', 'expense-attachments');

commit;
