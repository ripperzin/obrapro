-- SCRIPT DE SINCRONIZAÇÃO FORÇADA
-- Execute este script para alinhar todos os orçamentos com a soma das unidades atuais

DO $$
DECLARE
    r_project RECORD;
    v_total_units DECIMAL(15,2);
    v_budget_id UUID;
BEGIN
    FOR r_project IN SELECT id, name FROM projects LOOP
        -- 1. Calcular soma das unidades
        SELECT COALESCE(SUM(cost), 0) INTO v_total_units FROM units WHERE project_id = r_project.id;
        
        -- 2. Atualizar o projeto
        UPDATE projects SET expected_total_cost = v_total_units WHERE id = r_project.id;
        
        -- 3. Buscar ou Criar budget
        SELECT id INTO v_budget_id FROM project_budgets WHERE project_id = r_project.id;
        
        IF v_budget_id IS NOT NULL THEN
            -- Atualizar budget existente
            UPDATE project_budgets SET total_estimated = v_total_units WHERE id = v_budget_id;
            
            -- Recalcular macros
            UPDATE project_macros pm
            SET estimated_value = (v_total_units * percentage) / 100.0
            WHERE budget_id = v_budget_id;
            
            -- Recalcular sub-macros
            UPDATE project_sub_macros psm
            SET estimated_value = (pm.estimated_value * (psm.percentage / 100.0))
            FROM project_macros pm
            WHERE psm.project_macro_id = pm.id AND pm.budget_id = v_budget_id;
            
            RAISE NOTICE 'Projeto % (%) sincronizado para R$ %', r_project.name, r_project.id, v_total_units;
        END IF;
    END LOOP;
END $$;
