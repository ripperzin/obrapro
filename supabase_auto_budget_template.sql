-- =====================================================
-- TRIGGER: POPULAR ORÇAMENTO AUTOMATICAMENTE
-- =====================================================

CREATE OR REPLACE FUNCTION handle_new_project_budget()
RETURNS TRIGGER AS $$
DECLARE
    r_t_macro RECORD;
    v_p_macro_id UUID;
    v_total DECIMAL(15,2);
    v_template_id UUID;
    v_final_template_id UUID;
BEGIN
    v_total := NEW.total_estimated;
    v_template_id := NEW.template_id;

    -- Se não foi informado template, tentar usar o padrão direto
    IF v_template_id IS NULL THEN
        SELECT id INTO v_final_template_id FROM cost_templates WHERE is_default = true LIMIT 1;
    ELSE
        v_final_template_id := v_template_id;
    END IF;

    -- Se ainda não tem template (ou não achou), aborta (mas permite a criação do budget vazio)
    IF v_final_template_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Copiar Macros do Template -> Projeto
    FOR r_t_macro IN 
        SELECT * FROM template_macros 
        WHERE template_id = v_final_template_id
        ORDER BY display_order ASC
    LOOP
        -- Inserir Macro no Projeto
        INSERT INTO project_macros (
            budget_id,
            name,
            percentage,
            estimated_value,
            spent_value,
            display_order
        ) VALUES (
            NEW.id,
            r_t_macro.name,
            r_t_macro.percentage,
            (v_total * r_t_macro.percentage) / 100.0,
            0,
            r_t_macro.display_order
        ) RETURNING id INTO v_p_macro_id;

        -- Copiar Sub-Macros do Template -> Projeto
        INSERT INTO project_sub_macros (
            project_macro_id,
            name,
            percentage,
            estimated_value,
            spent_value,
            display_order
        )
        SELECT 
            v_p_macro_id,
            name,
            percentage,
            ((v_total * r_t_macro.percentage) / 100.0) * (percentage / 100.0), -- Valor estimado proporcional
            0,
            display_order
        FROM template_sub_macros
        WHERE macro_id = r_t_macro.id
        ORDER BY display_order ASC;

    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para rodar DEPOIS de inserir um orçamento
DROP TRIGGER IF EXISTS trigger_auto_populate_budget ON project_budgets;
CREATE TRIGGER trigger_auto_populate_budget
AFTER INSERT ON project_budgets
FOR EACH ROW
EXECUTE FUNCTION handle_new_project_budget();
