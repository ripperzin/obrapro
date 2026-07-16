-- ============================================================================
-- ITENS DA DESPESA (aposenta o eixo "submacro/detalhe" — passo 1, ADITIVO)
-- ----------------------------------------------------------------------------
-- Cada despesa passa a ter, além da Etapa (macro), um ITEM: a lista plana de
-- "o que eu comprei" (cimento, tijolo, frete...). O Item é GLOBAL da obra
-- (cimento é um só, atravessa etapas). Esta migration só ADICIONA — NÃO remove
-- os submacros; o app segue funcionando até as telas migrarem no passo seguinte.
--
-- Modelo de acompanhamento (ver memória do projeto):
--   Etapa = régua (orçamento por etapa).  Item = espelho ("pra onde foi o
--   dinheiro", por etapa e no total). Nada de meta/perfil por item aqui — isso
--   é camada futura. Aqui é só o alicerce: item como etiqueta na despesa.
-- ============================================================================

-- ── 1) Lista MODELO de itens (catálogo global, semeia cada obra nova) ────────
CREATE TABLE IF NOT EXISTS public.template_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid REFERENCES public.cost_templates(id) ON DELETE CASCADE,
    name text NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);
ALTER TABLE public.template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read template_items" ON public.template_items;
CREATE POLICY "read template_items" ON public.template_items
    FOR SELECT TO authenticated USING (true);
GRANT SELECT ON TABLE public.template_items TO authenticated, service_role;

-- Semeia a lista padrão (idempotente: limpa antes de inserir).
DO $$
DECLARE tpl uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  DELETE FROM public.template_items WHERE template_id = tpl;
  -- Lista final (43 itens) — nomes simples; preset MCMV mapeia nesses nomes.
  INSERT INTO public.template_items (template_id, name, display_order) VALUES
    -- Serviços, mão de obra e custos de apoio
    (tpl, 'Mão de obra',                  1),
    (tpl, 'Administração e apoio da obra', 2),
    (tpl, 'Serviços técnicos',            3),
    (tpl, 'Taxas',                        4),
    (tpl, 'Ferramentas e EPIs',           5),
    (tpl, 'Locação de equipamentos',      6),
    (tpl, 'Frete',                        7),
    (tpl, 'Caçamba',                      8),
    -- Movimento de terra e estrutura
    (tpl, 'Aterro',                       9),
    (tpl, 'Cimento',                      10),
    (tpl, 'Areia',                        11),
    (tpl, 'Pedra',                        12),
    (tpl, 'Ferro',                        13),
    (tpl, 'Concreto',                     14),
    (tpl, 'Lajes e pré-moldados',         15),
    (tpl, 'Tijolos e blocos',             16),
    (tpl, 'Argamassa',                    17),
    (tpl, 'Cal',                          18),
    (tpl, 'Madeira',                      19),
    -- Cobertura e instalações
    (tpl, 'Telhas',                       20),
    (tpl, 'Calhas e rufos',               21),
    (tpl, 'Impermeabilização',            22),
    (tpl, 'Tubos e conexões',             23),
    (tpl, 'Materiais elétricos',          24),
    (tpl, 'Caixa d''água',                25),
    (tpl, 'Gás',                          26),
    (tpl, 'Climatização',                 27),
    -- Revestimentos e acabamentos
    (tpl, 'Pisos e revestimentos',        28),
    (tpl, 'Rejunte',                      29),
    (tpl, 'Gesso',                        30),
    (tpl, 'Mármore e granito',            31),
    (tpl, 'Portas',                       32),
    (tpl, 'Janelas',                      33),
    (tpl, 'Vidros',                       34),
    (tpl, 'Louças e metais',              35),
    (tpl, 'Pintura',                      36),
    (tpl, 'Serralheria',                  37),
    (tpl, 'Portões',                      38),
    -- Área externa e entrega
    (tpl, 'Paisagismo',                   39),
    (tpl, 'Limpeza final',                40),
    -- Recorrentes (canteiro / presos ao tempo → etapa "Canteiro/Gerais")
    (tpl, 'Container',                    41),
    (tpl, 'Água (conta da obra)',         42),
    (tpl, 'Luz (conta da obra)',          43);
END $$;

-- ── 2) Itens da OBRA (lista plana por projeto, editável) ─────────────────────
CREATE TABLE IF NOT EXISTS public.project_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name text NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_items_project_id_idx ON public.project_items (project_id);
ALTER TABLE public.project_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_items_all" ON public.project_items;
CREATE POLICY "project_items_all" ON public.project_items TO authenticated
    USING (public.can_access_project(project_id))
    WITH CHECK (public.can_access_project(project_id));
GRANT ALL ON TABLE public.project_items TO authenticated, service_role;

-- ── 3) A despesa aponta pra um item (nulo = sem item) ────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.project_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_item_id_idx ON public.expenses (item_id);

-- ── 4) Semeadura dos itens na CRIAÇÃO da obra (não no orçamento) ─────────────
-- Copia a lista modelo → itens da obra. Idempotente: só semeia se ainda não há.
CREATE OR REPLACE FUNCTION public.seed_project_items(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_items WHERE project_id = p_project_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.project_items (project_id, name, display_order)
  SELECT p_project_id, ti.name, ti.display_order
    FROM public.template_items ti
   WHERE ti.template_id = '00000000-0000-0000-0000-000000000001'
   ORDER BY ti.display_order;
END $$;

-- Estende o gatilho de criação de obra (hoje só cria o dono) p/ semear itens.
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (new.id, auth.uid(), 'owner');

  PERFORM public.seed_project_items(new.id);

  RETURN new;
END $$;

-- ── 5) Semeia as obras JÁ existentes (pra o campo Item nascer cheio hoje) ─────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.projects LOOP
    PERFORM public.seed_project_items(r.id);
  END LOOP;
END $$;
