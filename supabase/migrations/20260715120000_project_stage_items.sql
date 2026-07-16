-- ============================================================================
-- PREVISTO POR ITEM DENTRO DA ETAPA (Previsto × Real por item)
-- ----------------------------------------------------------------------------
-- Cada obra passa a guardar, por ETAPA, o Previsto de cada ITEM (semeado do
-- preset MCMV: template_stage_items). Ex.: na Fundação, Cimento = 8% da etapa.
-- O valor Previsto em R$ NÃO é gravado aqui — deriva de macro.estimated_value ×
-- percentage/100 (assim reescala junto com a etapa quando o total da obra muda).
--
-- Regra de ouro (ver memória): o Previsto fica PARADO — despesa/ item novo mexe
-- SÓ no Real, nunca re-fecha o Previsto. Item sem linha aqui = "fora do previsto"
-- (aparece na etapa mostrando só o gasto). Editável no futuro.
-- Migration ADITIVA, só LOCAL — não mexe em produção.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_stage_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    macro_id uuid NOT NULL REFERENCES public.project_macros(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
    percentage numeric NOT NULL DEFAULT 0,  -- % do item DENTRO da etapa (Previsto)
    display_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE (macro_id, item_id)
);
CREATE INDEX IF NOT EXISTS project_stage_items_project_idx ON public.project_stage_items (project_id);
CREATE INDEX IF NOT EXISTS project_stage_items_macro_idx ON public.project_stage_items (macro_id);

ALTER TABLE public.project_stage_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_stage_items_all" ON public.project_stage_items;
CREATE POLICY "project_stage_items_all" ON public.project_stage_items TO authenticated
    USING (public.can_access_project(project_id))
    WITH CHECK (public.can_access_project(project_id));
GRANT ALL ON TABLE public.project_stage_items TO authenticated, service_role;

-- Semeia o Previsto por item a partir do preset (template_stage_items), casando
-- etapa por NOME (template_stage_items.macro_name = project_macros.name) e item
-- por NOME. Idempotente: só semeia se ainda não houver linha para a obra (assim
-- preserva edições futuras). Precisa que a obra já tenha orçamento/macros + itens.
CREATE OR REPLACE FUNCTION public.seed_project_stage_items(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_stage_items WHERE project_id = p_project_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.project_stage_items (project_id, macro_id, item_id, percentage, display_order)
  SELECT p_project_id, pm.id, pi.id, tsi.percentage, tsi.display_order
    FROM public.project_budgets pb
    JOIN public.project_macros pm ON pm.budget_id = pb.id
    JOIN public.template_stage_items tsi
      ON tsi.template_id = '00000000-0000-0000-0000-000000000001'
     AND lower(tsi.macro_name) = lower(pm.name)
    JOIN public.project_items pi
      ON pi.project_id = p_project_id
     AND lower(pi.name) = lower(tsi.item_name)
   WHERE pb.project_id = p_project_id;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_project_stage_items(uuid) TO authenticated, service_role;

-- Semeia as obras já existentes (as que têm etapas com nomes do template atual;
-- obras antigas com nomes diferentes ficam sem Previsto por item — ok, mostram
-- os itens como "fora do previsto", só o gasto).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.projects LOOP
    PERFORM public.seed_project_stage_items(r.id);
  END LOOP;
END $$;
