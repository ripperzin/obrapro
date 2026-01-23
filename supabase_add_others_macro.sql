-- =====================================================
-- MIGRATION: ADICIONAR MACRO "OUTROS"
-- Garante que existe uma categoria para despesas não classificadas
-- =====================================================

DO $$
DECLARE
    v_template_id UUID := '00000000-0000-0000-0000-000000000001';
    v_outros_macro_id UUID;
BEGIN
    RAISE NOTICE 'Iniciando migração para categoria Outros...';

    -- 1. ADICIONAR "OUTROS" AO TEMPLATE PADRÃO (se não existir)
    SELECT id INTO v_outros_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Outros';
    
    IF v_outros_macro_id IS NULL THEN
        INSERT INTO template_macros (template_id, name, percentage, display_order)
        VALUES (v_template_id, 'Outros', 0.00, 99)
        RETURNING id INTO v_outros_macro_id;
        
        RAISE NOTICE 'Macro Outros criada no template.';
    END IF;

    -- Garantir Sub-macro "Geral" no Template
    IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = v_outros_macro_id) THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order)
        VALUES (v_outros_macro_id, 'Geral', 100.00, 1);
        RAISE NOTICE 'Sub-macro Geral criada no template.';
    END IF;


    -- 2. ATUALIZAR ORÇAMENTOS DE PROJETOS EXISTENTES
    -- Inserir 'Outros' em projetos que ainda não têm
    INSERT INTO project_macros (budget_id, name, percentage, estimated_value, spent_value, display_order)
    SELECT 
        pb.id, 
        'Outros', 
        0.00, 
        0.00, 
        0.00, 
        99
    FROM project_budgets pb
    WHERE NOT EXISTS (
        SELECT 1 FROM project_macros pm WHERE pm.budget_id = pb.id AND pm.name = 'Outros'
    );
    
    -- 3. INSERIR SUB-MACRO "GERAL" NOS PROJETOS (onde acabou de ser criado ou já existia sem sub)
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

    RAISE NOTICE 'Migração concluída com sucesso.';
END $$;
