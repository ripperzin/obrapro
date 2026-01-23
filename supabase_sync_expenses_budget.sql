-- =====================================================
-- MIGRATION: DATA SYNC & AUTOMATIC TRIGGERS
-- =====================================================

DO $$
DECLARE
    r_expense RECORD;
    v_macro_id UUID;
    v_budget_id UUID;
BEGIN
    RAISE NOTICE 'Iniciando sincronização de dados...';

    -- 1. CORREÇÃO DE DADOS: Vincular despesas órfãs a "Geral/Outros"
    -- -------------------------------------------------------------
    FOR r_expense IN SELECT * FROM expenses WHERE macro_id IS NULL LOOP
        
        -- Buscar o ID do orçamento do projeto dessa despesa
        SELECT id INTO v_budget_id FROM project_budgets WHERE project_id = r_expense.project_id LIMIT 1;
        
        IF v_budget_id IS NOT NULL THEN
            -- Buscar a macro "Geral/Outros" (ou "Outros" fallback) dentro desse orçamento
            SELECT id INTO v_macro_id 
            FROM project_macros 
            WHERE budget_id = v_budget_id 
            AND (name = 'Geral/Outros' OR name = 'Outros')
            ORDER BY name ASC -- Prioriza Geral/Outros se tiver os dois, mas o ideal é ter limpeza antes
            LIMIT 1;

            IF v_macro_id IS NOT NULL THEN
                UPDATE expenses 
                SET macro_id = v_macro_id 
                WHERE id = r_expense.id;
            END IF;
        END IF;
    END LOOP;
END $$;

-- 2. FUNÇÕES DE GATILHO (TRIGGERS)
-- --------------------------------

-- Função A: Atualizar Valor Gasto da Macro
CREATE OR REPLACE FUNCTION update_macro_spent_value()
RETURNS TRIGGER AS $$
BEGIN
    -- Se inseriu ou atualizou (tem NEW)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.macro_id IS NOT NULL THEN
        UPDATE project_macros
        SET spent_value = (
            SELECT COALESCE(SUM(value), 0)
            FROM project_expenses
            WHERE macro_id = NEW.macro_id
        )
        WHERE id = NEW.macro_id;
    END IF;

    -- Se deletou ou atualizou (tem OLD e mudou de macro)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.macro_id IS NOT NULL THEN
         -- Se for UPDATE e o ID não mudou, o bloco acima já resolveu.
         -- Mas se mudou de categoria, precisamos atualizar a ANTIGA também.
         IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.macro_id <> NEW.macro_id) THEN
            UPDATE project_macros
            SET spent_value = (
                SELECT COALESCE(SUM(value), 0)
                FROM expenses
                WHERE macro_id = OLD.macro_id
            )
            WHERE id = OLD.macro_id;
         END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Função B: Atualizar Valor Gasto do Sub-Macro
CREATE OR REPLACE FUNCTION update_sub_macro_spent_value()
RETURNS TRIGGER AS $$
BEGIN
    -- NEW
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.sub_macro_id IS NOT NULL THEN
        UPDATE project_sub_macros
        SET spent_value = (
            SELECT COALESCE(SUM(value), 0)
            FROM project_expenses
            WHERE sub_macro_id = NEW.sub_macro_id
        )
        WHERE id = NEW.sub_macro_id;
    END IF;

    -- OLD
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.sub_macro_id IS NOT NULL THEN
         IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.sub_macro_id <> NEW.sub_macro_id) THEN
            UPDATE project_sub_macros
            SET spent_value = (
                SELECT COALESCE(SUM(value), 0)
                FROM expenses
                WHERE sub_macro_id = OLD.sub_macro_id
            )
            WHERE id = OLD.sub_macro_id;
         END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 3. APLICAR TRIGGERS NA TABELA DE DESPESAS
-- -----------------------------------------
DROP TRIGGER IF EXISTS tr_update_macro_spent ON expenses;
CREATE TRIGGER tr_update_macro_spent
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION update_macro_spent_value();

DROP TRIGGER IF EXISTS tr_update_sub_macro_spent ON expenses;
CREATE TRIGGER tr_update_sub_macro_spent
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW EXECUTE FUNCTION update_sub_macro_spent_value();


-- 4. FORÇAR RECÁLCULO GERAL AGORA (Para corrigir o passado)
-- --------------------------------------------------------
DO $$
DECLARE
    r_macro RECORD;
BEGIN
    -- Recalcular todas as macros
    UPDATE project_macros pm
    SET spent_value = (
        SELECT COALESCE(SUM(value), 0)
        FROM project_expenses
        WHERE macro_id = pm.id
    );

    -- Recalcular todos os sub-macros
    UPDATE project_sub_macros psm
    SET spent_value = (
        SELECT COALESCE(SUM(value), 0)
        FROM project_expenses
        WHERE sub_macro_id = psm.id
    );
END $$;
