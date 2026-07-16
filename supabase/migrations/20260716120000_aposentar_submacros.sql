-- Aposenta o eixo "submacro" (o antigo "Detalhe") de vez.
--
-- Contexto: a reescrita trocou submacro por "Item" (expenses.item_id -> project_items)
-- e tirou o submacro da tela do app. Mas o BANCO nunca soube disso: o gatilho de
-- criacao de orcamento continuava semeando 52 submacros por obra nova, dois gatilhos
-- continuavam recalculando submacro a cada despesa, e o link do investidor ainda
-- renderizava a arvore de submacros (todos com R$ 0 gasto, porque o app nao escreve
-- mais sub_macro_id). Isto encerra o eixo.
--
-- O QUE NAO MUDA: gasto por etapa (update_macro_spent_value nao toca em submacro),
-- anexos, descricao, valor, data, quem pagou. Nada de despesa e apagado.
--
-- As TABELAS project_sub_macros/template_sub_macros e a coluna expenses.sub_macro_id
-- ficam de proposito: o app ainda faz join nelas (useProjects, pdfGenerator,
-- investor-portal). Dropar antes de limpar o codigo quebraria o app em producao.
-- O drop e um passo separado, depois do deploy do codigo limpo.

begin;

-- 1) Parar de recalcular submacro a cada despesa lancada.
drop trigger if exists tr_update_sub_macro_spent on public.expenses;
drop function if exists public.update_sub_macro_spent_value();

-- 2) Parar de espalhar valor de etapa para os submacros.
drop trigger if exists tr_macro_sync_submacros on public.project_macros;
drop function if exists public.fn_sync_macro_to_submacros();

-- 3) Obra nova nao nasce mais com submacro.
--    Corpo copiado de pg_get_functiondef da versao VIVA em producao
--    (20260715170000_macro_time_based) menos o bloco do submacro.
--    Preserva time_based, que e o que tira o Canteiro da regua do avanco.
create or replace function public.handle_new_project_budget()
returns trigger
language plpgsql
as $function$
DECLARE
    r_t_macro RECORD;
    v_total DECIMAL(15,2);
    v_template_id UUID;
    v_final_template_id UUID;
BEGIN
    v_total := COALESCE(NEW.total_estimated, 0);
    v_template_id := NEW.template_id;

    IF v_template_id IS NULL THEN
        SELECT id INTO v_final_template_id FROM cost_templates WHERE is_default = true LIMIT 1;
    ELSE
        v_final_template_id := v_template_id;
    END IF;

    IF v_final_template_id IS NULL THEN
        RETURN NEW;
    END IF;

    FOR r_t_macro IN
        SELECT * FROM template_macros
        WHERE template_id = v_final_template_id
        ORDER BY display_order ASC
    LOOP
        INSERT INTO project_macros (
            budget_id, name, percentage, estimated_value, spent_value, display_order, time_based
        ) VALUES (
            NEW.id,
            r_t_macro.name,
            r_t_macro.percentage,
            (v_total * r_t_macro.percentage) / 100.0,
            0,
            r_t_macro.display_order,
            COALESCE(r_t_macro.time_based, false)
        );
    END LOOP;

    RETURN NEW;
END;
$function$;

-- 4) Limpar a sobra.
update public.expenses set sub_macro_id = null where sub_macro_id is not null;
delete from public.project_sub_macros;
delete from public.template_sub_macros;

commit;
