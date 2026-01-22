-- =====================================================
-- SUBTÓPICOS DE MACROS - MIGRATION
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- TABELA 1: template_sub_macros (Subtópicos do Template)
-- =====================================================
CREATE TABLE IF NOT EXISTS template_sub_macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    macro_id UUID REFERENCES template_macros(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELA 2: project_sub_macros (Subtópicos do Projeto)
-- =====================================================
CREATE TABLE IF NOT EXISTS project_sub_macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_macro_id UUID REFERENCES project_macros(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    estimated_value DECIMAL(15,2) NOT NULL,
    spent_value DECIMAL(15,2) DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ADICIONAR COLUNA sub_macro_id NA TABELA expenses
-- =====================================================
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS sub_macro_id UUID REFERENCES project_sub_macros(id);

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE template_sub_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sub_macros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read template sub macros" ON template_sub_macros
    FOR SELECT USING (true);

CREATE POLICY "Users can manage project sub macros" ON project_sub_macros
    FOR ALL USING (true);

-- =====================================================
-- POPULAR SUBTÓPICOS DO TEMPLATE
-- Baseado na planilha do usuário
-- =====================================================

-- Primeiro, buscar os IDs das macros existentes
DO $$
DECLARE
    v_infra_id UUID;
    v_supra_id UUID;
    v_alvenaria_id UUID;
    v_instalacoes_id UUID;
    v_acabamento_id UUID;
BEGIN
    -- Buscar IDs das macros
    SELECT id INTO v_infra_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Infra e Fundação';
    SELECT id INTO v_supra_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Supraestrutura';
    SELECT id INTO v_alvenaria_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Alvenaria e Cobertura';
    SELECT id INTO v_instalacoes_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Instalações (MEP)';
    SELECT id INTO v_acabamento_id FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001' AND name = 'Acabamento';

    -- 3. Infra e Fundação
    IF v_infra_id IS NOT NULL THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, description, display_order) VALUES
            (v_infra_id, 'Aço (Armação)', 35.00, 'Preço oscila com o dólar', 1),
            (v_infra_id, 'Concreto Usinado', 40.00, 'Maior volume de compra nesta fase', 2),
            (v_infra_id, 'Madeira (Fôrmas)', 10.00, 'Item com alto índice de desperdício', 3)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4. Supraestrutura
    IF v_supra_id IS NOT NULL THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, description, display_order) VALUES
            (v_supra_id, 'Concreto Usinado', 45.00, 'Essencial para o cronograma (lajes)', 1),
            (v_supra_id, 'Aço (Vigas e Pilares)', 40.00, 'Item mais caro da fase estrutural', 2),
            (v_supra_id, 'Escoramentos/Fôrmas', 10.00, 'Frequentemente alugado ou comprado', 3)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 5. Alvenaria e Cobertura
    IF v_alvenaria_id IS NOT NULL THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, description, display_order) VALUES
            (v_alvenaria_id, 'Blocos / Tijolos', 45.00, 'Define o ritmo da vedação', 1),
            (v_alvenaria_id, 'Cimento e Areia', 25.00, 'Insumos de alto consumo diário', 2),
            (v_alvenaria_id, 'Telhas e Madeira', 25.00, 'Fechamento da obra (protege o interior)', 3)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 6. Instalações (MEP)
    IF v_instalacoes_id IS NOT NULL THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, description, display_order) VALUES
            (v_instalacoes_id, 'Cabos e Fios Elétricos', 35.00, 'O cobre é o material mais visado/caro', 1),
            (v_instalacoes_id, 'Tubos e Conexões', 25.00, 'Essencial para hidráulica e esgoto', 2),
            (v_instalacoes_id, 'Louças e Metais', 30.00, 'Itens que o investidor gosta de escolher', 3)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 7. Acabamento
    IF v_acabamento_id IS NOT NULL THEN
        INSERT INTO template_sub_macros (macro_id, name, percentage, description, display_order) VALUES
            (v_acabamento_id, 'Pisos e Porcelanato', 50.00, 'O item que mais varia de preço (padrão)', 1),
            (v_acabamento_id, 'Argamassas e Rejunte', 15.00, 'Consumo volumétrico alto', 2),
            (v_acabamento_id, 'Tintas e Seladores', 20.00, 'Finalização visual da obra', 3)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- TRIGGER: Atualizar spent_value da sub_macro
-- =====================================================
CREATE OR REPLACE FUNCTION update_sub_macro_spent_value()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar o spent_value da sub_macro quando uma despesa é inserida/atualizada
    IF NEW.sub_macro_id IS NOT NULL THEN
        UPDATE project_sub_macros
        SET spent_value = (
            SELECT COALESCE(SUM(value), 0)
            FROM expenses
            WHERE sub_macro_id = NEW.sub_macro_id
        )
        WHERE id = NEW.sub_macro_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar spent_value das sub_macros
DROP TRIGGER IF EXISTS trigger_update_sub_macro_spent ON expenses;
CREATE TRIGGER trigger_update_sub_macro_spent
    AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_sub_macro_spent_value();

-- =====================================================
-- VERIFICAÇÃO
-- =====================================================
-- SELECT tm.name as macro, tsm.name as sub_macro, tsm.percentage
-- FROM template_sub_macros tsm
-- JOIN template_macros tm ON tm.id = tsm.macro_id
-- ORDER BY tm.display_order, tsm.display_order;
