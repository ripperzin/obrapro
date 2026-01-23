-- =====================================================
-- MIGRATION: GERAL/OUTROS (SEM SUB-MACROS)
-- =====================================================

DO $$
DECLARE
    v_template_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    RAISE NOTICE 'Simplificando para Geral/Outros...';

    -- 1. TEMPLATE PADRÃO
    -- ------------------
    -- A. Se existir "Outros" e "Reserva", remove "Outros" (prioriza Reserva que tem %)
    DELETE FROM template_macros 
    WHERE template_id = v_template_id 
    AND name = 'Outros'
    AND EXISTS (SELECT 1 FROM template_macros WHERE template_id = v_template_id AND name = 'Reserva');

    -- B. Renomear "Reserva" -> "Geral/Outros"
    UPDATE template_macros SET name = 'Geral/Outros' WHERE template_id = v_template_id AND name = 'Reserva';

    -- C. Renomear "Outros" -> "Geral/Outros" (caso não tivesse Reserva)
    UPDATE template_macros SET name = 'Geral/Outros' WHERE template_id = v_template_id AND name = 'Outros';

    -- D. REMOVER SUB-MACROS do "Geral/Outros" (O usuário pediu SEM sub-macros)
    DELETE FROM template_sub_macros 
    WHERE macro_id IN (SELECT id FROM template_macros WHERE template_id = v_template_id AND name = 'Geral/Outros');


    -- 2. PROJETOS (ORÇAMENTOS)
    -- ------------------------
    -- A. Deletar "Outros" se já houver "Reserva" (merge simples)
    DELETE FROM project_macros pm_outros
    WHERE name = 'Outros'
    AND EXISTS (
        SELECT 1 FROM project_macros pm_reserva 
        WHERE pm_reserva.budget_id = pm_outros.budget_id 
        AND pm_reserva.name = 'Reserva'
    );

    -- B. Renomear "Reserva" -> "Geral/Outros"
    UPDATE project_macros SET name = 'Geral/Outros' WHERE name = 'Reserva';

    -- C. Renomear "Outros" -> "Geral/Outros"
    UPDATE project_macros SET name = 'Geral/Outros' WHERE name = 'Outros';

    -- D. REMOVER SUB-MACROS de "Geral/Outros" nos projetos
    DELETE FROM project_sub_macros
    WHERE project_macro_id IN (SELECT id FROM project_macros WHERE name = 'Geral/Outros');

    RAISE NOTICE 'Migração concluída: Reserva/Outros unificados em Geral/Outros sem sub-tópicos.';
END $$;
