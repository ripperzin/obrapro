-- =====================================================
-- MIGRATION: INCLUIR MÃO DE OBRA MANTENDO DETALHES (v3 - 30% MO)
-- =====================================================

DO $$
DECLARE
    v_template_id UUID := '00000000-0000-0000-0000-000000000001';
    v_macro_id UUID;
BEGIN
    -------------------------------------------------------
    -- 1. INFRA E FUNDAÇÃO
    -------------------------------------------------------
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Infra e Fundação';
    IF v_macro_id IS NOT NULL THEN
        DELETE FROM template_sub_macros WHERE macro_id = v_macro_id;
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES 
            (v_macro_id, 'Mão de Obra', 30.00, 1),
            (v_macro_id, 'Concreto Usinado', 30.00, 2),
            (v_macro_id, 'Aço (Armação)', 30.00, 3),
            (v_macro_id, 'Madeira (Fôrmas)', 10.00, 4);
    END IF;

    -------------------------------------------------------
    -- 2. SUPRAESTRUTURA
    -------------------------------------------------------
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Supraestrutura';
    IF v_macro_id IS NOT NULL THEN
        DELETE FROM template_sub_macros WHERE macro_id = v_macro_id;
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES 
            (v_macro_id, 'Mão de Obra', 30.00, 1),
            (v_macro_id, 'Concreto Usinado', 35.00, 2),
            (v_macro_id, 'Aço (Vigas/Pilares)', 25.00, 3),
            (v_macro_id, 'Escoras/Fôrmas', 10.00, 4);
    END IF;

    -------------------------------------------------------
    -- 3. ALVENARIA E COBERTURA
    -------------------------------------------------------
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Alvenaria e Cobertura';
    IF v_macro_id IS NOT NULL THEN
        DELETE FROM template_sub_macros WHERE macro_id = v_macro_id;
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES 
            (v_macro_id, 'Mão de Obra (Pedreiro)', 30.00, 1),
            (v_macro_id, 'Blocos / Tijolos', 35.00, 2),
            (v_macro_id, 'Telhas / Estrutura', 25.00, 3),
            (v_macro_id, 'Cimento e Areia', 10.00, 4);
    END IF;

    -------------------------------------------------------
    -- 4. INSTALAÇÕES (MEP)
    -------------------------------------------------------
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Instalações (MEP)';
    IF v_macro_id IS NOT NULL THEN
        DELETE FROM template_sub_macros WHERE macro_id = v_macro_id;
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES 
            (v_macro_id, 'Mão de Obra (Eletricista/Encanador)', 30.00, 1),
            (v_macro_id, 'Tubos e Conexões', 25.00, 2),
            (v_macro_id, 'Fios e Cabos', 25.00, 3),
            (v_macro_id, 'Louças e Metais', 20.00, 4);
    END IF;

    -------------------------------------------------------
    -- 5. ACABAMENTO
    -------------------------------------------------------
    SELECT id INTO v_macro_id FROM template_macros WHERE template_id = v_template_id AND name = 'Acabamento';
    IF v_macro_id IS NOT NULL THEN
        DELETE FROM template_sub_macros WHERE macro_id = v_macro_id;
        INSERT INTO template_sub_macros (macro_id, name, percentage, display_order) VALUES 
            (v_macro_id, 'Mão de Obra (Acabamento)', 30.00, 1),
            (v_macro_id, 'Pisos e Revestimentos', 40.00, 2),
            (v_macro_id, 'Argamassa e Rejunte', 15.00, 3),
            (v_macro_id, 'Pintura (Material)', 15.00, 4);
    END IF;

END $$;
