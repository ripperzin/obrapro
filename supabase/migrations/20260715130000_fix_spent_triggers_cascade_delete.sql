-- ============================================================================
-- FIX: apagar obra estourava FK (project_macros_budget_id_fkey)
-- ----------------------------------------------------------------------------
-- Ao apagar uma obra, o CASCADE apaga as despesas; o gatilho AFTER DELETE que
-- recalcula spent_value fazia UPDATE em project_macros / project_sub_macros —
-- mas nesse ponto o orçamento (project_budgets) / a etapa (project_macros) já
-- podia ter sido apagado no mesmo cascade, e o UPDATE revalidava a FK do pai
-- inexistente → "insert or update ... violates foreign key constraint".
--
-- Correção: só recalcular se o PAI ainda existir (EXISTS). Se já foi apagado,
-- não faz sentido recalcular (a linha está indo embora também). Uso normal
-- (lançar/editar/excluir despesa avulsa) fica idêntico — o pai existe.
-- Migration idempotente (CREATE OR REPLACE); só LOCAL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_macro_spent_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  UPDATE project_macros pm
  SET spent_value = (
    SELECT COALESCE(SUM(e.value), 0)
    FROM expenses e
    WHERE e.macro_id = COALESCE(NEW.macro_id, OLD.macro_id)
  )
  WHERE pm.id = COALESCE(NEW.macro_id, OLD.macro_id)
    AND EXISTS (SELECT 1 FROM project_budgets pb WHERE pb.id = pm.budget_id);
  RETURN NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_sub_macro_spent_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  UPDATE project_sub_macros sm
  SET spent_value = (
    SELECT COALESCE(SUM(e.value), 0)
    FROM expenses e
    WHERE e.sub_macro_id = COALESCE(NEW.sub_macro_id, OLD.sub_macro_id)
  )
  WHERE sm.id = COALESCE(NEW.sub_macro_id, OLD.sub_macro_id)
    AND EXISTS (SELECT 1 FROM project_macros pm WHERE pm.id = sm.project_macro_id);
  RETURN NEW;
end;
$function$;
