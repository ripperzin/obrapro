-- ==============================================================================
-- MIGRATION: ETAPA "PRESA AO TEMPO" (conserta o Canteiro no cronograma)
-- DATA: 2026-07-15
-- ==============================================================================
-- PROBLEMA: "Canteiro e custos gerais" é a 9ª linha do orçamento, mas NÃO é uma
-- fase da obra — é custo recorrente (container, água, luz, caçamba) que corre do
-- primeiro ao último dia. O gerador de cronograma dava a cada etapa uma fatia do
-- calendário proporcional ao seu % de CUSTO, em ordem; como o Canteiro é o
-- último da fila, ele ganhava os ÚLTIMOS 5% do prazo (os dias finais da obra) —
-- exatamente o contrário do que ele é.
--
-- SOLUÇÃO: o banco passa a saber a diferença. `time_based = true` significa
-- "não é uma fase, é um custo que atravessa a obra". O cronograma então estica
-- essa linha de ponta a ponta e reparte o calendário só entre as fases de fato.
--
-- Isso NÃO mexe em dinheiro: o % de custo do Canteiro continua igual. Muda só
-- como ele é colocado no tempo.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. COLUNA NOS DOIS LADOS (preset e obra)
-- ------------------------------------------------------------------------------
alter table public.template_macros
  add column if not exists time_based boolean not null default false;

alter table public.project_macros
  add column if not exists time_based boolean not null default false;

-- ------------------------------------------------------------------------------
-- 2. MARCA O CANTEIRO NO PRESET
--    Por nome: é a única linha recorrente do template MCMV (9ª etapa).
-- ------------------------------------------------------------------------------
update public.template_macros
   set time_based = true
 where name ilike 'canteiro%';

-- ------------------------------------------------------------------------------
-- 3. OBRAS QUE JÁ EXISTEM: herdam a marca pelo nome da etapa.
--    Obras antigas (template de 7 etapas) têm "Geral/Outros", que é a mesma
--    ideia — custo que corre a obra, não uma fase.
-- ------------------------------------------------------------------------------
update public.project_macros
   set time_based = true
 where name ilike 'canteiro%'
    or name ilike 'geral/outros%';

-- ------------------------------------------------------------------------------
-- 4. O GATILHO PASSA A COPIAR A MARCA PRO ORÇAMENTO DA OBRA NOVA
--    (mesmo corpo de antes; só entra time_based no INSERT dos macros)
-- ------------------------------------------------------------------------------
create or replace function public.handle_new_project_budget()
returns trigger
language plpgsql
as $function$
DECLARE
    r_t_macro RECORD;
    v_p_macro_id UUID;
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
        ) RETURNING id INTO v_p_macro_id;

        INSERT INTO project_sub_macros (
            project_macro_id, name, percentage, estimated_value, spent_value, display_order
        )
        SELECT
            v_p_macro_id,
            name,
            percentage,
            ((v_total * r_t_macro.percentage) / 100.0) * (percentage / 100.0),
            0,
            display_order
        FROM template_sub_macros
        WHERE macro_id = r_t_macro.id
        ORDER BY display_order ASC;
    END LOOP;

    RETURN NEW;
END;
$function$;

commit;
