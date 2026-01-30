-- 1. Função para sincronizar unidades -> projeto
CREATE OR REPLACE FUNCTION fn_sync_units_to_project()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE projects 
        SET 
            expected_total_cost = (SELECT COALESCE(SUM(cost), 0) FROM units WHERE project_id = OLD.project_id),
            expected_total_sales = (SELECT COALESCE(SUM(COALESCE(sale_value, valor_estimado_venda, 0)), 0) FROM units WHERE project_id = OLD.project_id),
            unit_count = (SELECT COUNT(*) FROM units WHERE project_id = OLD.project_id)
        WHERE id = OLD.project_id;
        RETURN OLD;
    ELSE
        UPDATE projects 
        SET 
            expected_total_cost = (SELECT COALESCE(SUM(cost), 0) FROM units WHERE project_id = NEW.project_id),
            expected_total_sales = (SELECT COALESCE(SUM(COALESCE(sale_value, valor_estimado_venda, 0)), 0) FROM units WHERE project_id = NEW.project_id),
            unit_count = (SELECT COUNT(*) FROM units WHERE project_id = NEW.project_id)
        WHERE id = NEW.project_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger na tabela units
DROP TRIGGER IF EXISTS tr_units_sync_project ON units;
CREATE TRIGGER tr_units_sync_project
AFTER INSERT OR UPDATE OR DELETE ON units
FOR EACH ROW EXECUTE FUNCTION fn_sync_units_to_project();

-- 2. Função para sincronizar projeto -> orçamento
CREATE OR REPLACE FUNCTION fn_sync_project_to_budget()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE project_budgets 
    SET 
        total_estimated = NEW.expected_total_cost,
        updated_at = NOW()
    WHERE project_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger na tabela projects (apenas quando o custo esperado muda)
DROP TRIGGER IF EXISTS tr_project_sync_budget ON projects;
CREATE TRIGGER tr_project_sync_budget
AFTER UPDATE OF expected_total_cost ON projects
FOR EACH ROW
WHEN (OLD.expected_total_cost IS DISTINCT FROM NEW.expected_total_cost)
EXECUTE FUNCTION fn_sync_project_to_budget();

-- 3. Função para sincronizar orçamento -> macros
CREATE OR REPLACE FUNCTION fn_sync_budget_to_macros()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE project_macros 
    SET 
        estimated_value = (NEW.total_estimated * percentage) / 100.0
    WHERE budget_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger na tabela project_budgets
DROP TRIGGER IF EXISTS tr_budget_sync_macros ON project_budgets;
CREATE TRIGGER tr_budget_sync_macros
AFTER UPDATE OF total_estimated ON project_budgets
FOR EACH ROW
WHEN (OLD.total_estimated IS DISTINCT FROM NEW.total_estimated)
EXECUTE FUNCTION fn_sync_budget_to_macros();

-- 4. Função para sincronizar macros -> sub-macros
CREATE OR REPLACE FUNCTION fn_sync_macro_to_submacros()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE project_sub_macros 
    SET 
        estimated_value = (NEW.estimated_value * (percentage / 100.0))
    WHERE project_macro_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger na tabela project_macros
DROP TRIGGER IF EXISTS tr_macro_sync_submacros ON project_macros;
CREATE TRIGGER tr_macro_sync_submacros
AFTER UPDATE OF estimated_value ON project_macros
FOR EACH ROW
WHEN (OLD.estimated_value IS DISTINCT FROM NEW.estimated_value)
EXECUTE FUNCTION fn_sync_macro_to_submacros();
