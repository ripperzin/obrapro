-- supabase_standardize_categories_v3.sql
-- Run this to standardize categories across all projects and templates
-- Removes 'Despesas Gerais da Obra', redistributes percentages, and cleans up sub-macros

BEGIN;

-- 1. TEMPLATE MACROS --
-- Delete 'Despesas Gerais da Obra'
DELETE FROM template_macros WHERE name = 'Despesas Gerais da Obra';
-- Redistribute %
UPDATE template_macros SET percentage = 32, display_order = 4 WHERE name = 'Estrutura e Alvenaria';
UPDATE template_macros SET percentage = 14, display_order = 5 WHERE name = 'Elétrica e Hidráulica';
UPDATE template_macros SET percentage = 27, display_order = 6 WHERE name = 'Acabamentos (Piso/Reboco/Pintura)';
UPDATE template_macros SET percentage = 5, display_order = 7 WHERE name = 'Geral/Outros';

-- 2. TEMPLATE SUB-MACROS --
-- Delete all existing sub-macros to recreate them cleanly
DELETE FROM template_sub_macros;

-- Insert new clean sub-macros for Template
DO $$
DECLARE
    v_template_id UUID := '00000000-0000-0000-0000-000000000001';
    v_macro_id UUID;
BEGIN
    -- Fundação e Alicerce (12%)
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Fundação e Alicerce';
    IF FOUND THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
        (v_macro_id, 'Mão de Obra', 25, 1),
        (v_macro_id, 'Concreto / Concreto Usinado', 20, 2),
        (v_macro_id, 'Aço (Armação)', 15, 3),
        (v_macro_id, 'Aterro', 10, 4),
        (v_macro_id, 'Tijolo', 10, 5),
        (v_macro_id, 'Madeira (Fôrmas)', 8, 6),
        (v_macro_id, 'Areia', 5, 7),
        (v_macro_id, 'Cimento', 5, 8),
        (v_macro_id, 'Pedra', 2, 9);
    END IF;

    -- Estrutura e Alvenaria (32%)
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Estrutura e Alvenaria';
    IF FOUND THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
        (v_macro_id, 'Mão de Obra (Pedreiro/Armador)', 30, 1),
        (v_macro_id, 'Concreto Usinado', 12, 2),
        (v_macro_id, 'Blocos / Tijolos', 12, 3),
        (v_macro_id, 'Aço (Vigas/Pilares/Armação)', 10, 4),
        (v_macro_id, 'Treliças Pré-Moldadas', 8, 5),
        (v_macro_id, 'Cimento', 7, 6),
        (v_macro_id, 'Telhas', 7, 7),
        (v_macro_id, 'Areia', 6, 8),
        (v_macro_id, 'Madeira', 4, 9),
        (v_macro_id, 'Pedras', 4, 10);
    END IF;

    -- Elétrica e Hidráulica (14%)
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Elétrica e Hidráulica';
    IF FOUND THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
        (v_macro_id, 'Mão de Obra (Eletricista/Encanador)', 30, 1),
        (v_macro_id, 'Cabos e Fios Elétricos', 25, 2),
        (v_macro_id, 'Tubos e Conexões', 25, 3),
        (v_macro_id, 'Louças e Metais', 20, 4);
    END IF;

    -- Acabamentos (27%)
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Acabamentos (Piso/Reboco/Pintura)';
    IF FOUND THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES
        (v_macro_id, 'Pisos e Porcelanato', 30, 1),
        (v_macro_id, 'Mão de Obra (Acabamento)', 25, 2),
        (v_macro_id, 'Vidros / Esquadrias', 20, 3),
        (v_macro_id, 'Tintas e Seladores', 15, 4),
        (v_macro_id, 'Argamassas e Rejunte', 10, 5);
    END IF;
END $$;


-- 3. PROJECT MACROS AND EXPENSE REMAPPING --
DO $$
DECLARE
    b_rec RECORD;
    m_rec RECORD;
    v_geral_id UUID;
    v_despesas_gerais_id UUID;
    v_proj_eng_id UUID;
    v_macro_id UUID;
BEGIN
    FOR b_rec IN SELECT id, total_estimated FROM project_budgets LOOP
        
        -- A. Handle 'Despesas Gerais da Obra' removal
        SELECT id INTO v_despesas_gerais_id FROM project_macros WHERE budget_id = b_rec.id AND name = 'Despesas Gerais da Obra';
        IF FOUND THEN
            -- Find 'Geral/Outros'
            SELECT id INTO v_geral_id FROM project_macros WHERE budget_id = b_rec.id AND name = 'Geral/Outros';
            IF v_geral_id IS NULL THEN
                -- Rename it instead of moving
                UPDATE project_macros SET name = 'Geral/Outros', percentage = 5, display_order = 7 WHERE id = v_despesas_gerais_id;
            ELSE
                -- Move expenses to Geral/Outros
                UPDATE expenses SET macro_id = v_geral_id, sub_macro_id = NULL WHERE macro_id = v_despesas_gerais_id;
                -- Delete the macro
                DELETE FROM project_macros WHERE id = v_despesas_gerais_id;
            END IF;
        END IF;

        -- B. Add 'Projetos e Engenharia' if missing (Rua do Sorriso)
        SELECT id INTO v_proj_eng_id FROM project_macros WHERE budget_id = b_rec.id AND name = 'Projetos e Engenharia';
        IF NOT FOUND THEN
            INSERT INTO project_macros (budget_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (b_rec.id, 'Projetos e Engenharia', 7, b_rec.total_estimated * 0.07, 0, 1);
        END IF;

        -- Add 'Geral/Outros' if missing
        SELECT id INTO v_geral_id FROM project_macros WHERE budget_id = b_rec.id AND name = 'Geral/Outros';
        IF NOT FOUND THEN
            INSERT INTO project_macros (budget_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (b_rec.id, 'Geral/Outros', 5, b_rec.total_estimated * 0.05, 0, 7);
        END IF;

        -- C. Update Macro % and display_order
        UPDATE project_macros SET percentage = 32, display_order = 4 WHERE budget_id = b_rec.id AND name = 'Estrutura e Alvenaria';
        UPDATE project_macros SET percentage = 14, display_order = 5 WHERE budget_id = b_rec.id AND name = 'Elétrica e Hidráulica';
        UPDATE project_macros SET percentage = 27, display_order = 6 WHERE budget_id = b_rec.id AND name = 'Acabamentos (Piso/Reboco/Pintura)';
        UPDATE project_macros SET percentage = 5, display_order = 7 WHERE budget_id = b_rec.id AND name = 'Geral/Outros';

    END LOOP;
END $$;


-- 4. PROJECT SUB-MACROS CLEANUP --
DO $$
DECLARE
    m_rec RECORD;
    v_keeper_id UUID;
    v_loser_id UUID;
BEGIN
    -- We need to clean up duplicates in every project's macros.
    
    -- A. Fundação e Alicerce
    FOR m_rec IN SELECT id FROM project_macros WHERE name = 'Fundação e Alicerce' LOOP
        -- 1. Concreto
        SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Concreto Usinado', 'Concreto / Concreto Usinado') LIMIT 1;
        IF v_keeper_id IS NULL THEN
            -- Create it if missing
            INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (m_rec.id, 'Concreto / Concreto Usinado', 20, 0, 0, 2) RETURNING id INTO v_keeper_id;
        ELSE
            UPDATE project_sub_macros SET name = 'Concreto / Concreto Usinado', percentage = 20, display_order = 2 WHERE id = v_keeper_id;
        END IF;
        
        -- Move expenses from 'Concreto' to keeper
        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name = 'Concreto' AND id != v_keeper_id LOOP
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;

        -- 2. Madeira
        SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Madeira (Fôrmas)', 'Madeira') LIMIT 1;
        IF v_keeper_id IS NULL THEN
            INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (m_rec.id, 'Madeira (Fôrmas)', 8, 0, 0, 6) RETURNING id INTO v_keeper_id;
        ELSE
            UPDATE project_sub_macros SET name = 'Madeira (Fôrmas)', percentage = 8, display_order = 6 WHERE id = v_keeper_id;
        END IF;
        
        -- Move expenses from other 'Madeira'
        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name = 'Madeira' AND id != v_keeper_id LOOP
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;
        
        -- Normalize others
        UPDATE project_sub_macros SET percentage = 25, display_order = 1 WHERE project_macro_id = m_rec.id AND name = 'Mão de Obra';
        UPDATE project_sub_macros SET percentage = 15, display_order = 3 WHERE project_macro_id = m_rec.id AND name = 'Aço (Armação)';
        UPDATE project_sub_macros SET percentage = 10, display_order = 4 WHERE project_macro_id = m_rec.id AND name = 'Aterro';
        UPDATE project_sub_macros SET percentage = 10, display_order = 5 WHERE project_macro_id = m_rec.id AND name = 'Tijolo';
        UPDATE project_sub_macros SET percentage = 5, display_order = 7 WHERE project_macro_id = m_rec.id AND name = 'Areia';
        UPDATE project_sub_macros SET percentage = 5, display_order = 8 WHERE project_macro_id = m_rec.id AND name = 'Cimento';
        UPDATE project_sub_macros SET percentage = 2, display_order = 9 WHERE project_macro_id = m_rec.id AND name = 'Pedra';
    END LOOP;

    -- B. Estrutura e Alvenaria
    FOR m_rec IN SELECT id FROM project_macros WHERE name = 'Estrutura e Alvenaria' LOOP
        -- 1. Mão de Obra (Merge 'Mão de Obra' and 'Mão de Obra (Pedreiro)')
        SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Mão de Obra (Pedreiro/Armador)', 'Mão de Obra (Pedreiro)', 'Mão de Obra') LIMIT 1;
        IF v_keeper_id IS NULL THEN
            INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (m_rec.id, 'Mão de Obra (Pedreiro/Armador)', 30, 0, 0, 1) RETURNING id INTO v_keeper_id;
        ELSE
            UPDATE project_sub_macros SET name = 'Mão de Obra (Pedreiro/Armador)', percentage = 30, display_order = 1 WHERE id = v_keeper_id;
        END IF;

        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Mão de Obra (Pedreiro)', 'Mão de Obra') AND id != v_keeper_id LOOP
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;

        -- 2. Aço (Merge 'Aço (Vigas e Pilares)' and 'Aço')
        SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Aço (Vigas/Pilares/Armação)', 'Aço (Vigas e Pilares)', 'Aço') LIMIT 1;
        IF v_keeper_id IS NULL THEN
            INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (m_rec.id, 'Aço (Vigas/Pilares/Armação)', 10, 0, 0, 4) RETURNING id INTO v_keeper_id;
        ELSE
            UPDATE project_sub_macros SET name = 'Aço (Vigas/Pilares/Armação)', percentage = 10, display_order = 4 WHERE id = v_keeper_id;
        END IF;

        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Aço (Vigas e Pilares)', 'Aço') AND id != v_keeper_id LOOP
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;

        -- 3. Telhas (Merge 'Telhas e Madeira', 'Telhas / Madeira / Estrutura', 'Telhas')
        SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Telhas', 'Telhas / Madeira / Estrutura', 'Telhas e Madeira') LIMIT 1;
        IF v_keeper_id IS NULL THEN
            INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (m_rec.id, 'Telhas', 7, 0, 0, 7) RETURNING id INTO v_keeper_id;
        ELSE
            UPDATE project_sub_macros SET name = 'Telhas', percentage = 7, display_order = 7 WHERE id = v_keeper_id;
        END IF;

        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Telhas / Madeira / Estrutura', 'Telhas e Madeira') AND id != v_keeper_id LOOP
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;

        -- 4. Remove 'Escoramentos/Fôrmas'
        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name = 'Escoramentos/Fôrmas' LOOP
            -- Move any expenses to 'Madeira' or 'Mão de Obra' before deleting. Since it's removed, let's map to Madeira.
            SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name = 'Madeira' LIMIT 1;
            IF v_keeper_id IS NULL THEN
                INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
                VALUES (m_rec.id, 'Madeira', 4, 0, 0, 9) RETURNING id INTO v_keeper_id;
            END IF;
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;

        -- Normalize the rest
        UPDATE project_sub_macros SET percentage = 12, display_order = 2 WHERE project_macro_id = m_rec.id AND name = 'Concreto Usinado';
        UPDATE project_sub_macros SET percentage = 12, display_order = 3 WHERE project_macro_id = m_rec.id AND name = 'Blocos / Tijolos';
        UPDATE project_sub_macros SET percentage = 8, display_order = 5 WHERE project_macro_id = m_rec.id AND name = 'Treliças Pré-Moldadas';
        UPDATE project_sub_macros SET percentage = 7, display_order = 6 WHERE project_macro_id = m_rec.id AND name = 'Cimento';
        UPDATE project_sub_macros SET percentage = 6, display_order = 8 WHERE project_macro_id = m_rec.id AND name = 'Areia';
        UPDATE project_sub_macros SET percentage = 4, display_order = 9 WHERE project_macro_id = m_rec.id AND name = 'Madeira';
        UPDATE project_sub_macros SET percentage = 4, display_order = 10 WHERE project_macro_id = m_rec.id AND name = 'Pedras';
    END LOOP;

    -- C. Elétrica e Hidráulica
    FOR m_rec IN SELECT id FROM project_macros WHERE name = 'Elétrica e Hidráulica' LOOP
        UPDATE project_sub_macros SET percentage = 30, display_order = 1 WHERE project_macro_id = m_rec.id AND name = 'Mão de Obra (Eletricista/Encanador)';
        UPDATE project_sub_macros SET percentage = 25, display_order = 2 WHERE project_macro_id = m_rec.id AND name = 'Cabos e Fios Elétricos';
        UPDATE project_sub_macros SET percentage = 25, display_order = 3 WHERE project_macro_id = m_rec.id AND name = 'Tubos e Conexões';
        UPDATE project_sub_macros SET percentage = 20, display_order = 4 WHERE project_macro_id = m_rec.id AND name = 'Louças e Metais';
    END LOOP;

    -- D. Acabamentos
    FOR m_rec IN SELECT id FROM project_macros WHERE name = 'Acabamentos (Piso/Reboco/Pintura)' LOOP
        UPDATE project_sub_macros SET name = 'Pisos e Porcelanato', percentage = 30, display_order = 1 WHERE project_macro_id = m_rec.id AND name IN ('Pisos e Revestimentos', 'Pisos e Porcelanato');
        UPDATE project_sub_macros SET percentage = 25, display_order = 2 WHERE project_macro_id = m_rec.id AND name = 'Mão de Obra (Acabamento)';
        
        -- Merge Vidros and Esquadrias if exist
        SELECT id INTO v_keeper_id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Vidros / Esquadrias', 'Vidros') LIMIT 1;
        IF v_keeper_id IS NULL THEN
            INSERT INTO project_sub_macros (project_macro_id, name, percentage, estimated_value, spent_value, display_order)
            VALUES (m_rec.id, 'Vidros / Esquadrias', 20, 0, 0, 3) RETURNING id INTO v_keeper_id;
        ELSE
            UPDATE project_sub_macros SET name = 'Vidros / Esquadrias', percentage = 20, display_order = 3 WHERE id = v_keeper_id;
        END IF;

        FOR v_loser_id IN SELECT id FROM project_sub_macros WHERE project_macro_id = m_rec.id AND name IN ('Vidros') AND id != v_keeper_id LOOP
            UPDATE expenses SET sub_macro_id = v_keeper_id WHERE sub_macro_id = v_loser_id;
            DELETE FROM project_sub_macros WHERE id = v_loser_id;
        END LOOP;

        UPDATE project_sub_macros SET percentage = 15, display_order = 4 WHERE project_macro_id = m_rec.id AND name = 'Tintas e Seladores';
        UPDATE project_sub_macros SET percentage = 10, display_order = 5 WHERE project_macro_id = m_rec.id AND name = 'Argamassas e Rejunte';
    END LOOP;
END $$;


-- 5. RECALCULATE ESTIMATED AND SPENT VALUES --
DO $$
DECLARE
    b_rec RECORD;
BEGIN
    FOR b_rec IN SELECT id, total_estimated FROM project_budgets LOOP
        -- Recalculate macro estimated values
        UPDATE project_macros 
        SET estimated_value = b_rec.total_estimated * (percentage / 100.0)
        WHERE budget_id = b_rec.id;

        -- Recalculate macro spent values
        UPDATE project_macros pm
        SET spent_value = COALESCE((SELECT SUM(value) FROM expenses WHERE macro_id = pm.id), 0)
        WHERE budget_id = b_rec.id;

        -- Recalculate sub-macro estimated values
        UPDATE project_sub_macros psm
        SET estimated_value = pm.estimated_value * (psm.percentage / 100.0)
        FROM project_macros pm
        WHERE psm.project_macro_id = pm.id AND pm.budget_id = b_rec.id;

        -- Recalculate sub-macro spent values
        UPDATE project_sub_macros psm
        SET spent_value = COALESCE((SELECT SUM(value) FROM expenses WHERE sub_macro_id = psm.id), 0)
        FROM project_macros pm
        WHERE psm.project_macro_id = pm.id AND pm.budget_id = b_rec.id;
    END LOOP;
END $$;

COMMIT;
