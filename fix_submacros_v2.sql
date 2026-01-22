-- ==========================================================
-- SCRIPT DE CORREÇÃO V2: REPARAR SUB-MACROS E POPULAR DADOS
-- ==========================================================

DO $$
DECLARE
    v_infra_id UUID;
    v_supra_id UUID;
    v_alvenaria_id UUID;
    v_instalacoes_id UUID;
    v_acabamento_id UUID;
    r_project_macro RECORD;
    r_template_sub RECORD;
    v_inserted_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Iniciando reparo de subtópicos...';

    -- 1. GARANTIR QUE OS TEMPLATES EXISTEM (Repopular se necessário)
    -- Buscar IDs das macros do template padrão
    SELECT id INTO v_infra_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Infra e Fundação';
    SELECT id INTO v_supra_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Supraestrutura';
    SELECT id INTO v_alvenaria_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Alvenaria e Cobertura';
    SELECT id INTO v_instalacoes_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Instalações (MEP)';
    SELECT id INTO v_acabamento_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Acabamento';

    -- Inserir templates se não existirem (Verifica pelo nome e macro_id)
    IF v_infra_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = v_infra_id) THEN
            INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
                (v_infra_id, 'Aço (Armação)', 35.00, 1),
                (v_infra_id, 'Concreto Usinado', 40.00, 2),
                (v_infra_id, 'Madeira (Fôrmas)', 10.00, 3);
        END IF;
    END IF;

    IF v_supra_id IS NOT NULL THEN
         IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = v_supra_id) THEN
            INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
                (v_supra_id, 'Concreto Usinado', 45.00, 1),
                (v_supra_id, 'Aço (Vigas e Pilares)', 40.00, 2),
                (v_supra_id, 'Escoramentos/Fôrmas', 10.00, 3);
         END IF;
    END IF;

    IF v_alvenaria_id IS NOT NULL THEN
         IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = v_alvenaria_id) THEN
            INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
                (v_alvenaria_id, 'Blocos / Tijolos', 45.00, 1),
                (v_alvenaria_id, 'Cimento e Areia', 25.00, 2),
                (v_alvenaria_id, 'Telhas e Madeira', 25.00, 3);
         END IF;
    END IF;

    IF v_instalacoes_id IS NOT NULL THEN
         IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = v_instalacoes_id) THEN
            INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
                (v_instalacoes_id, 'Cabos e Fios Elétricos', 35.00, 1),
                (v_instalacoes_id, 'Tubos e Conexões', 25.00, 2),
                (v_instalacoes_id, 'Louças e Metais', 30.00, 3);
         END IF;
    END IF;

    IF v_acabamento_id IS NOT NULL THEN
         IF NOT EXISTS (SELECT 1 FROM template_sub_macros WHERE macro_id = v_acabamento_id) THEN
            INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
                (v_acabamento_id, 'Pisos e Porcelanato', 50.00, 1),
                (v_acabamento_id, 'Argamassas e Rejunte', 15.00, 2),
                (v_acabamento_id, 'Tintas e Seladores', 20.00, 3);
         END IF;
    END IF;

    -- 2. CORRIGIR PROJETOS EXISTENTES
    -- Percorrer TODAS as macros de todos os orçamentos
    FOR r_project_macro IN SELECT * FROM project_macros LOOP
        
        -- Verificar se est macro JÁ TEM sub-macros
        IF NOT EXISTS (SELECT 1 FROM project_sub_macros WHERE project_macro_id = r_project_macro.id) THEN
            
            -- Tentar achar o template correspondente pelo NOME (TRIM + Case Insensitive)
            -- Isso ajuda se houver pequenas diferenças de digitação
            FOR r_template_sub IN 
                SELECT tsm.* 
                FROM template_sub_macros tsm
                JOIN template_macros tm ON tm.id = tsm.macro_id
                WHERE TRIM(LOWER(tm.name)) = TRIM(LOWER(r_project_macro.name))
            LOOP
                -- Encontrou correspondência! Inserir sub-macro no projeto
                INSERT INTO project_sub_macros (
                    project_macro_id,
                    name,
                    percentage,
                    estimated_value,
                    spent_value,
                    display_order
                ) VALUES (
                    r_project_macro.id,
                    r_template_sub.name,
                    r_template_sub.percentage,
                    (r_project_macro.estimated_value * r_template_sub.percentage) / 100.0,
                    0,
                    r_template_sub.display_order
                );
                
                v_inserted_count := v_inserted_count + 1;
            END LOOP;
            
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Concluído! Total de sub-macros inseridas/recuperadas: %', v_inserted_count;

END $$;
