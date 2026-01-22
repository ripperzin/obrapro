-- =====================================================
-- MACRO-DESPESAS E ORÇAMENTO - MIGRATION
-- Execute este SQL no Supabase SQL Editor
-- =====================================================

-- =====================================================
-- TABELA 1: cost_templates (Templates de Orçamento)
-- =====================================================
CREATE TABLE IF NOT EXISTS cost_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELA 2: template_macros (Macros do Template)
-- =====================================================
CREATE TABLE IF NOT EXISTS template_macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES cost_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    materials_hint TEXT, -- Ex: "Aço, Concreto, Madeira"
    labor_hint TEXT, -- Ex: "Empreitada de Fundação"
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TABELA 3: project_budgets (Orçamento da Obra)
-- =====================================================
CREATE TABLE IF NOT EXISTS project_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    total_estimated DECIMAL(15,2) NOT NULL,
    template_id UUID REFERENCES cost_templates(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id) -- Cada projeto tem apenas um orçamento
);

-- =====================================================
-- TABELA 4: project_macros (Macros do Projeto)
-- =====================================================
CREATE TABLE IF NOT EXISTS project_macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID REFERENCES project_budgets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL,
    estimated_value DECIMAL(15,2) NOT NULL,
    spent_value DECIMAL(15,2) DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- ADICIONAR COLUNA macro_id NA TABELA expenses
-- =====================================================
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS macro_id UUID REFERENCES project_macros(id);

-- =====================================================
-- RLS POLICIES (Row Level Security)
-- =====================================================

-- Enable RLS
ALTER TABLE cost_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_macros ENABLE ROW LEVEL SECURITY;

-- Policies for cost_templates (todos podem ler templates padrão)
CREATE POLICY "Anyone can read default templates" ON cost_templates
    FOR SELECT USING (is_default = true);

CREATE POLICY "Users can read own templates" ON cost_templates
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own templates" ON cost_templates
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Policies for template_macros
CREATE POLICY "Anyone can read macros of visible templates" ON template_macros
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM cost_templates 
            WHERE cost_templates.id = template_macros.template_id
            AND (is_default = true OR created_by = auth.uid())
        )
    );

-- Policies for project_budgets (baseado no acesso ao projeto)
CREATE POLICY "Users can manage own project budgets" ON project_budgets
    FOR ALL USING (true); -- Simplificado, ajustar conforme necessário

-- Policies for project_macros
CREATE POLICY "Users can manage own project macros" ON project_macros
    FOR ALL USING (true); -- Simplificado, ajustar conforme necessário

-- =====================================================
-- TEMPLATE PADRÃO: "Obra Padrão Brasil"
-- Baseado nos dados históricos reais do usuário
-- =====================================================
INSERT INTO cost_templates (id, name, description, is_default)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Obra Padrão Brasil',
    'Template baseado em dados históricos de obras residenciais no Brasil. Inclui 9 macros com percentuais típicos.',
    true
) ON CONFLICT DO NOTHING;

-- Inserir as 9 macros do template padrão
INSERT INTO template_macros (template_id, name, percentage, materials_hint, labor_hint, display_order)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Serviços Técnicos', 7.00, 'Projetos impressos, Cópias', 'Honorários (Arquiteto/Eng.)', 1),
    ('00000000-0000-0000-0000-000000000001', 'Documentação', 3.00, 'Taxas, Emolumentos', 'Despachante / Tramites', 2),
    ('00000000-0000-0000-0000-000000000001', 'Infra e Fundação', 12.00, 'Aço, Concreto, Madeira', 'Empreitada de Fundação', 3),
    ('00000000-0000-0000-0000-000000000001', 'Supraestrutura', 18.00, 'Aço, Concreto, Escoras', 'Carpinteiro e Armador', 4),
    ('00000000-0000-0000-0000-000000000001', 'Alvenaria e Cobertura', 12.00, 'Blocos, Cimento, Telhas', 'Pedreiro e Servente', 5),
    ('00000000-0000-0000-0000-000000000001', 'Instalações (MEP)', 13.00, 'Fios, Tubos, Louças', 'Eletricista e Encanador', 6),
    ('00000000-0000-0000-0000-000000000001', 'Acabamento', 25.00, 'Pisos, Argamassa, Tintas', 'Azulejista e Pintor', 7),
    ('00000000-0000-0000-0000-000000000001', 'Indiretos/Canteiro', 5.00, 'Aluguel de Máquinas', 'Limpeza e Vigilância', 8),
    ('00000000-0000-0000-0000-000000000001', 'Reserva', 5.00, '-', '-', 9)
ON CONFLICT DO NOTHING;

-- =====================================================
-- FUNÇÃO: Atualizar spent_value ao inserir despesa
-- =====================================================
CREATE OR REPLACE FUNCTION update_macro_spent_value()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar o spent_value da macro quando uma despesa é inserida/atualizada
    IF NEW.macro_id IS NOT NULL THEN
        UPDATE project_macros
        SET spent_value = (
            SELECT COALESCE(SUM(value), 0)
            FROM expenses
            WHERE macro_id = NEW.macro_id
        )
        WHERE id = NEW.macro_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar spent_value
DROP TRIGGER IF EXISTS trigger_update_macro_spent ON expenses;
CREATE TRIGGER trigger_update_macro_spent
    AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_macro_spent_value();

-- =====================================================
-- VERIFICAÇÃO
-- =====================================================
-- Execute para verificar que tudo foi criado:
-- SELECT * FROM cost_templates;
-- SELECT * FROM template_macros WHERE template_id = '00000000-0000-0000-0000-000000000001';
