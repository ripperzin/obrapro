-- ==============================================================================
-- FIX: corrigir a etapa de uma despesa deixava gasto fantasma na etapa antiga
-- DATA: 2026-07-15
-- ==============================================================================
-- ⚠️ ESTE DEFEITO JÁ ESTÁ VIVO EM PRODUÇÃO (confirmado: a função lá também usa
-- COALESCE(NEW, OLD)). Hoje o dado de prod está limpo — 0 divergências entre
-- spent_value e a soma real — porque a troca de etapa nunca foi acionada. Mas a
-- reescrita cria caminhos novos para editar a etapa da despesa, então a chance
-- de pisar na mina sobe muito.
--
-- O DEFEITO
-- Os gatilhos AFTER INSERT/DELETE/UPDATE recalculavam UMA etapa só:
--     COALESCE(NEW.macro_id, OLD.macro_id)
-- Num UPDATE isso escolhe SEMPRE o destino (NEW) e NUNCA recalcula a origem
-- (OLD). Resultado: mover uma despesa de etapa some com o dinheiro da origem
-- — o valor fica gravado lá para sempre e nunca se conserta sozinho.
--
-- Medido no banco local, obra RUA DO SORRISO, movendo 1 despesa de R$ 10.000:
--     "Projetos e Engenharia": gravado R$ 13.000  x  real R$ 3.000  -> erro de R$ 10.000
--
-- Isso corrompe o "gasto por etapa", que é o núcleo do produto (achar desvio
-- antes de perder a margem). O Previsto (custo das unidades × % da etapa) NÃO é
-- afetado — só o Real.
--
-- Curiosidade: o caso "tirei a etapa da despesa" (NEW.macro_id = null)
-- funcionava por acidente, porque aí o COALESCE caía no OLD.
--
-- A CORREÇÃO
-- Recalcular AS DUAS PONTAS (origem e destino), e não uma só. Usa TG_OP em vez
-- de COALESCE para saber quais existem: em INSERT não há OLD, em DELETE não há
-- NEW. Mantém o conserto de 20260715130000 (só recalcula se o pai ainda
-- existir, senão apagar a obra estoura a FK no cascade).
-- ==============================================================================

begin;

create or replace function public.update_macro_spent_value()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_destino uuid := null;   -- etapa depois da edição (NEW)
  v_origem  uuid := null;   -- etapa antes da edição (OLD)  <- era esta que ficava para trás
  v_id      uuid;
begin
  IF TG_OP <> 'DELETE' THEN v_destino := NEW.macro_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_origem  := OLD.macro_id; END IF;

  -- As duas pontas, sem nulo e sem repetir (edição que não mexeu na etapa).
  -- COALESCE para '{}': sem ele, despesa sem etapa/sub-item devolve NULL aqui e
  -- o FOREACH estoura ("FOREACH expression must not be null") — quebraria TODA
  -- edição de despesa.
  FOREACH v_id IN ARRAY coalesce((
    select array_agg(distinct x) from unnest(array[v_destino, v_origem]) x where x is not null
  ), array[]::uuid[]) LOOP
    UPDATE project_macros pm
       SET spent_value = (
             SELECT COALESCE(SUM(e.value), 0) FROM expenses e WHERE e.macro_id = v_id
           )
     WHERE pm.id = v_id
       -- Pai ainda existe? Se a obra está sendo apagada em cascade, não recalcula
       -- (a linha vai embora junto) — senão o UPDATE revalida uma FK órfã.
       AND EXISTS (SELECT 1 FROM project_budgets pb WHERE pb.id = pm.budget_id);
  END LOOP;

  RETURN NULL;  -- AFTER trigger: o retorno é ignorado
end;
$function$;

create or replace function public.update_sub_macro_spent_value()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_destino uuid := null;
  v_origem  uuid := null;
  v_id      uuid;
begin
  IF TG_OP <> 'DELETE' THEN v_destino := NEW.sub_macro_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_origem  := OLD.sub_macro_id; END IF;

  -- COALESCE para '{}': sem ele, despesa sem etapa/sub-item devolve NULL aqui e
  -- o FOREACH estoura ("FOREACH expression must not be null") — quebraria TODA
  -- edição de despesa.
  FOREACH v_id IN ARRAY coalesce((
    select array_agg(distinct x) from unnest(array[v_destino, v_origem]) x where x is not null
  ), array[]::uuid[]) LOOP
    UPDATE project_sub_macros sm
       SET spent_value = (
             SELECT COALESCE(SUM(e.value), 0) FROM expenses e WHERE e.sub_macro_id = v_id
           )
     WHERE sm.id = v_id
       AND EXISTS (SELECT 1 FROM project_macros pm WHERE pm.id = sm.project_macro_id);
  END LOOP;

  RETURN NULL;
end;
$function$;

commit;
