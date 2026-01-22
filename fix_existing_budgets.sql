-- ==========================================================
-- SCRIPT DE CORREÇÃO: POPULAR SUB-MACROS EM ORÇAMENTOS EXISTENTES
-- ==========================================================

-- Este script percorre todas as macros de projeto existentes e,
-- se encontrar um template com o mesmo nome, insere as sub-macros correspondentes.

DO $$
DECLARE
    r_project_macro RECORD;
    r_template_macro RECORD;
    r_template_sub RECORD;
    v_estimated_sub DECIMAL(15,2);
BEGIN
    -- Loop por todas as macros de projeto existentes
    FOR r_project_macro IN SELECT * FROM project_macros LOOP
        
        -- Verificar se já tem sub-macros (para não duplicar se rodar 2x)
        PERFORM 1 FROM project_sub_macros WHERE project_macro_id = r_project_macro.id;
        
        IF NOT FOUND THEN
            -- Tentar encontrar a macro correspondente no template (pelo NOME)
            SELECT * INTO r_template_macro 
            FROM template_macros 
            WHERE name = r_project_macro.name 
            LIMIT 1;
            
            IF FOUND THEN
                RAISE NOTICE 'Adicionando sub-macros para: % (Projeto ID: %)', r_project_macro.name, r_project_macro.budget_id;
                
                -- Loop pelas sub-macros do template encontrado
                FOR r_template_sub IN SELECT * FROM template_sub_macros WHERE macro_id = r_template_macro.id LOOP
                    
                    -- Calcular valor estimado da sub-macro
                    -- Valor estimado da Sub = Valor estimado da Macro * (% da Sub / 100)
                    v_estimated_sub := (r_project_macro.estimated_value * r_template_sub.percentage) / 100.0;
                    
                    -- Inserir sub-macro do projeto
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
                        v_estimated_sub,
                        0, -- Spent value inicial zero. (O trigger não atualiza retroativo, precisaria rodar update)
                        r_template_sub.display_order
                    );
                    
                END LOOP;
            END IF;
        END IF;
    END LOOP;
    
    -- Opcional: Recalcular spent_value das sub-macros baseado nas despesas existentes?
    -- Se já existirem despesas com sub_macro_id (não existem pois acabou de ser criado),
    -- não precisa. Mas se for re-rodar para corrigir valores...
    -- Como acabamos de criar a coluna sub_macro_id, ela está NULL para todas despesas antigas.
    -- Então o spent_value será 0 mesmo. 
    -- Despesas antigas não terão sub_macro linkada automaticamente.
    -- O usuário terá que editar as despesas antigas para vincular às novas sub-macros.
    
END $$;
