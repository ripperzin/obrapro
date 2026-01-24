-- =====================================================
-- FIX: ATUALIZAR PROJETOS EXISTENTES (SAFE)
-- =====================================================
-- Este script vai percorrer os orçamentos JÁ CRIADOS e:
-- 1. Adicionar "Mão de Obra" se não existir.
-- 2. Atualizar as porcentagens dos materiais para o novo padrão (ex: Concreto de 40% -> 30%).
-- 3. Recalcular os valores estimados.

DO $$
DECLARE
    r_pm project_macros%ROWTYPE;
    v_total_budget DECIMAL(15,2);
    v_macro_value DECIMAL(15,2);
BEGIN
    -- Percorrer todas as macros de projetos existentes que sejam das etapas principais
    FOR r_pm IN 
        SELECT * FROM project_macros 
        WHERE name IN (
            'Infra e Fundação', 
            'Supraestrutura', 
            'Alvenaria e Cobertura', 
            'Instalações (MEP)', 
            'Acabamento'
        )
    LOOP
        -- Calcular valor total referência dessa macro
        v_macro_value := r_pm.estimated_value;
        
        -- ----------------------------------------------------
        -- 1. Inserir Mão de Obra se não existir
        -- ----------------------------------------------------
        INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, display_order)
        SELECT 
            r_pm.id, 
            CASE 
                WHEN r_pm.name LIKE 'Alvenaria%' THEN 'Mão de Obra (Pedreiro)'
                WHEN r_pm.name LIKE 'Instal%' THEN 'Mão de Obra (Eletricista/Encanador)'
                WHEN r_pm.name LIKE 'Acabamento%' THEN 'Mão de Obra (Acabamento)'
                ELSE 'Mão de Obra'
            END,
            30.00,
            (v_macro_value * 30.00) / 100.0,
            1
        WHERE NOT EXISTS (
            SELECT 1 FROM project_sub_macros 
            WHERE project_macro_id = r_pm.id AND name LIKE 'Mão de Obra%'
        );

        -- ----------------------------------------------------
        -- 2. Atualizar Porcentagens dos Materiais (Rebalanceamento)
        -- ----------------------------------------------------
        
        -- Infra
        IF r_pm.name = 'Infra e Fundação' THEN
            UPDATE project_sub_macros SET percentage = 30.00, estimated_value = (v_macro_value * 30.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Concreto%';
            UPDATE project_sub_macros SET percentage = 30.00, estimated_value = (v_macro_value * 30.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Aço%';
            UPDATE project_sub_macros SET percentage = 10.00, estimated_value = (v_macro_value * 10.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Madeira%';
        END IF;

        -- Supra
        IF r_pm.name = 'Supraestrutura' THEN
            UPDATE project_sub_macros SET percentage = 35.00, estimated_value = (v_macro_value * 35.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Concreto%';
            UPDATE project_sub_macros SET percentage = 25.00, estimated_value = (v_macro_value * 25.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Aço%';
            UPDATE project_sub_macros SET percentage = 10.00, estimated_value = (v_macro_value * 10.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Escoras%';
        END IF;

        -- Alvenaria
        IF r_pm.name = 'Alvenaria e Cobertura' THEN
            UPDATE project_sub_macros SET percentage = 35.00, estimated_value = (v_macro_value * 35.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Blocos%';
            UPDATE project_sub_macros SET percentage = 25.00, estimated_value = (v_macro_value * 25.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Telhas%';
            UPDATE project_sub_macros SET percentage = 10.00, estimated_value = (v_macro_value * 10.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Cimento%';
        END IF;

        -- Instalações
        IF r_pm.name = 'Instalações (MEP)' THEN
            UPDATE project_sub_macros SET percentage = 25.00, estimated_value = (v_macro_value * 25.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Tubos%';
            UPDATE project_sub_macros SET percentage = 25.00, estimated_value = (v_macro_value * 25.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Fios%';
            UPDATE project_sub_macros SET percentage = 20.00, estimated_value = (v_macro_value * 20.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Louças%';
        END IF;
        
        -- Acabamento
        IF r_pm.name = 'Acabamento' THEN
            UPDATE project_sub_macros SET percentage = 40.00, estimated_value = (v_macro_value * 40.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Pisos%';
            UPDATE project_sub_macros SET percentage = 15.00, estimated_value = (v_macro_value * 15.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Argamassa%';
            UPDATE project_sub_macros SET percentage = 15.00, estimated_value = (v_macro_value * 15.00)/100 WHERE project_macro_id = r_pm.id AND name LIKE 'Pintura%';
        END IF;

    END LOOP;
END $$;
