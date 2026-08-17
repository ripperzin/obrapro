-- Comprovante de APORTE e de TERRENO não abria para quem não subiu o arquivo.
--
-- A policy obrapro_storage_select (storage.objects) libera assim:
--     owner = auth.uid()  OR  can_access_storage_object(bucket_id, name)
-- e a função, no bucket 'expense-attachments', só olhava a tabela `expenses`.
-- Anexo de `contributions` (comprovante de aporte) e de `acquisition_costs`
-- (comprovante de terreno) ficavam de fora: só quem tinha feito o upload
-- conseguia abrir. Passava despercebido porque o dono da obra é quem sobe os
-- arquivos — quebrava apenas para sócio/funcionário convidado.
--
-- Encontrado em 17/08/2026, no primeiro dia com usuários externos no app: o
-- Davidson tomou "erro ao gerar link do anexo" no comprovante de um aporte.
--
-- Não amplia acesso: continua tudo preso a can_access_project(). Conferido em
-- prod rodando como `authenticated` com o uid do Davidson — o comprovante do
-- aporte passou de false para true, anexo de despesa seguiu true, caminho
-- inexistente false, e ele enxerga 32 dos 444 objetos do bucket (só os da obra
-- dele).

create or replace function public.can_access_storage_object(p_bucket text, p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    ) or exists (
      select 1 from public.contributions c
      where p_name = any(c.attachments) and public.can_access_project(c.project_id)
    ) or exists (
      select 1 from public.acquisition_costs a
      where p_name = any(a.attachments) and public.can_access_project(a.project_id)
    )
    else false
  end;
$function$;
