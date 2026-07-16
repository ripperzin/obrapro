-- ==============================================================================
-- CORREÇÃO DE SEGURANÇA: seed_project_items / seed_project_stage_items
-- DATA: 2026-07-15
-- ==============================================================================
-- PROBLEMA (confirmado por teste no banco local): as duas funções são
-- SECURITY DEFINER (rodam como dono do banco, ignorando RLS), recebem o
-- project_id de fora, NÃO checam se quem chamou tem acesso àquela obra, e
-- estão com EXECUTE liberado para PUBLIC — o que inclui `anon`. Como o
-- PostgREST expõe função pública como RPC, e a chave anônima está dentro do
-- app (no navegador), qualquer pessoa conseguia gravar na obra de qualquer
-- cliente:
--
--   set role anon; select public.seed_project_items('<obra de outro>');  -- gravava
--
-- Isso fura a RLS multi-tenant fechada em 20260609120000/20260610130000. Hoje
-- só existem 2 usuários (ambos admin), mas no self-serve é vazamento entre
-- clientes pagantes.
--
-- SOLUÇÃO: as funções continuam SECURITY DEFINER (precisam, para semear), mas
-- passam a (1) checar `can_access_project` do CHAMADOR e (2) só serem
-- executáveis por usuário autenticado — nunca por `anon`.
--
-- ⚠️ O CORPO ABAIXO É CÓPIA FIEL do que está vivo no banco (lido com
-- pg_get_functiondef). A ÚNICA mudança é o bloco de checagem no início. Não
-- reescrever de memória: a versão original tem detalhes fáceis de perder
-- (ex.: `display_order` no INSERT de project_stage_items).
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. seed_project_items
-- ------------------------------------------------------------------------------
create or replace function public.seed_project_items(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
BEGIN
  -- NOVO: quem chamou tem acesso a ESTA obra? Sem isto, escreve em qualquer uma.
  IF NOT public.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_items WHERE project_id = p_project_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.project_items (project_id, name, display_order)
  SELECT p_project_id, ti.name, ti.display_order
    FROM public.template_items ti
   WHERE ti.template_id = '00000000-0000-0000-0000-000000000001'
   ORDER BY ti.display_order;
END $function$;

-- ------------------------------------------------------------------------------
-- 2. seed_project_stage_items
-- ------------------------------------------------------------------------------
create or replace function public.seed_project_stage_items(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
BEGIN
  -- NOVO: mesma checagem de acesso.
  IF NOT public.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_stage_items WHERE project_id = p_project_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.project_stage_items (project_id, macro_id, item_id, percentage, display_order)
  SELECT p_project_id, pm.id, pi.id, tsi.percentage, tsi.display_order
    FROM public.project_budgets pb
    JOIN public.project_macros pm ON pm.budget_id = pb.id
    JOIN public.template_stage_items tsi
      ON tsi.template_id = '00000000-0000-0000-0000-000000000001'
     AND lower(tsi.macro_name) = lower(pm.name)
    JOIN public.project_items pi
      ON pi.project_id = p_project_id
     AND lower(pi.name) = lower(tsi.item_name)
   WHERE pb.project_id = p_project_id;
END $function$;

-- ------------------------------------------------------------------------------
-- 3. QUEM PODE CHAMAR: ninguém por padrão; só usuário logado.
--    `anon` (a chave que está no navegador) fica de fora.
-- ------------------------------------------------------------------------------
revoke all on function public.seed_project_items(uuid) from public, anon;
revoke all on function public.seed_project_stage_items(uuid) from public, anon;

grant execute on function public.seed_project_items(uuid) to authenticated;
grant execute on function public.seed_project_stage_items(uuid) to authenticated;

commit;
