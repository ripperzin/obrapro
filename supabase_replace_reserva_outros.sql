-- =====================================================
-- MIGRATION: SUBSTITUIR "RESERVA" POR "OUTROS"
-- =====================================================

DO $$
DECLARE
    v_template_id UUID := '00000000-0000-0000-0000-000000000001';
    r_macro RECORD;
BEGIN
    RAISE NOTICE 'Iniciando substituição de Reserva por Outros...';

    -- 1. TEMPLATE PADRÃO: Renomear "Reserva" para "Outros"
    -- Se já existir "Outros" (0%) e "Reserva" (5%), deletar "Outros" e renomear "Reserva" (para manter os 5%)
    
    -- Verificar se ambos existem no template
    IF EXISTS (SELECT 1 FROM template_macros WHERE template_id = v_template_id AND name = 'Outros') 
       AND EXISTS (SELECT 1 FROM template_macros WHERE template_id = v_template_id AND name = 'Reserva') THEN
       
       -- Deletar o "Outros" antigo (assumindo que foi criado vazio/0% pela migration anterior)
       DELETE FROM template_macros WHERE template_id = v_template_id AND name = 'Outros';
    END IF;

    -- Renomear Reserva -> Outros
    UPDATE template_macros 
    SET name = 'Outros' 
    WHERE template_id = v_template_id AND name = 'Reserva';
    
    -- Garantir que tem sub-macro "Geral"
    -- Pegar o ID do novo "Outros" (antiga Reserva)
    FOR r_macro IN SELECT id FROM template_macros WHERE template_id = v_template_id AND name = 'Outros' LOOP
        IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = r_macro.id) THEN
            INSERT INTO template_sub_macros (macro_id, name, percentage, display_order)
            VALUES (r_macro.id, 'Geral', 100.00, 1);
        END IF;
    END LOOP;


    -- 2. PROJETOS: Fazer o mesmo para cada orçamento
    -- Para cada orçamento que tenha AMBOS (Outros e Reserva), deletar o Outros (0%) e renomear Reserva (5%)
    
    -- Query complexa, vamos simplificar:
    -- A. Deletar "Outros" se houver "Reserva" no mesmo budget (priorizando a Reserva que tem os %)
    DELETE FROM project_macros pm_outros
    WHERE name = 'Outros'
    AND EXISTS (
        SELECT 1 FROM project_macros pm_reserva 
        WHERE pm_reserva.budget_id = pm_outros.budget_id 
        AND pm_reserva.name = 'Reserva'
    );

    -- B. Renomear "Reserva" para "Outros"
    UPDATE project_macros
    SET name = 'Outros'
    WHERE name = 'Reserva';

    -- C. Garantir sub-macro "Geral" em todos os "Outros"
    INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
    SELECT 
        pm.id,
        'Geral',
        100.00,
        0.00,
        0.00,
        1
    FROM project_macros pm
    WHERE pm.name = 'Outros'
    AND NOT EXISTS (
        SELECT 1 FROM project_sub_macros psm WHERE psm.project_macro_id = pm.id
    );

    RAISE NOTICE 'Substituição concluída.';
END $$;
