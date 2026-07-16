-- Remove triggers DUPLICADOS na tabela expenses.
-- Havia 2 pares fazendo o mesmo cálculo de spent_value -> recalculava 2x à toa.
-- Mantém tr_update_macro_spent / tr_update_sub_macro_spent (AFTER INSERT/UPDATE/DELETE,
-- mais completos pois tratam DELETE). Remove os trigger_update_* (só INSERT/UPDATE).
DROP TRIGGER IF EXISTS "trigger_update_macro_spent" ON "public"."expenses";
DROP TRIGGER IF EXISTS "trigger_update_sub_macro_spent" ON "public"."expenses";
