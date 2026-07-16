-- ============================================================================
-- PRESET MCMV: associação Item ↔ Etapa + % Previsto por item (passo do "Item")
-- ----------------------------------------------------------------------------
-- Grava o preset editável do Victor (2026-07-13):
--   (A) a "régua" das etapas passa a ter 9 linhas (adiciona "Canteiro e custos
--       gerais" e re-reparte as 8 de construção) — 4/11/22/9/14/17/14/4/5 = 100.
--   (B) para cada etapa, QUAIS itens pertencem a ela e com qual % dentro dela
--       (cada etapa fecha 100%). Isso é o "Previsto" default por item e também
--       o que deixa o campo Item filtrar pelos itens típicos da etapa.
--
-- Regra de ouro (ver memória): esses números são PONTO DE PARTIDA EDITÁVEL e
-- ficam PARADOS. Gasto/nota move só o Real, nunca re-fecha o Previsto.
-- Migration ADITIVA e só LOCAL — afeta apenas obras NOVAS (o template é copiado
-- na criação do orçamento). Não mexe em obras existentes nem em produção.
-- ============================================================================

DO $$
DECLARE
  tpl uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ── (A) Régua das etapas: novos %s + 9ª etapa "Canteiro e custos gerais" ────
  UPDATE public.template_macros SET percentage = 4  WHERE template_id = tpl AND name = 'Projetos e serviços preliminares';
  UPDATE public.template_macros SET percentage = 11 WHERE template_id = tpl AND name = 'Terraplenagem e fundações';
  UPDATE public.template_macros SET percentage = 22 WHERE template_id = tpl AND name = 'Estrutura e alvenaria';
  UPDATE public.template_macros SET percentage = 9  WHERE template_id = tpl AND name = 'Cobertura e impermeabilização';
  UPDATE public.template_macros SET percentage = 14 WHERE template_id = tpl AND name = 'Instalações elétricas e hidráulicas';
  UPDATE public.template_macros SET percentage = 17 WHERE template_id = tpl AND name = 'Revestimentos, pisos e forros';
  UPDATE public.template_macros SET percentage = 14 WHERE template_id = tpl AND name = 'Esquadrias, pintura e acabamentos';
  UPDATE public.template_macros SET percentage = 4  WHERE template_id = tpl AND name = 'Área externa, ligações e entrega';

  -- 9ª etapa: corre o tempo todo, NÃO é fase de construção (não gera avanço
  -- físico). É o lar dos custos recorrentes (container, água, luz, caçamba...).
  IF NOT EXISTS (SELECT 1 FROM public.template_macros WHERE template_id = tpl AND name = 'Canteiro e custos gerais') THEN
    INSERT INTO public.template_macros (template_id, name, percentage, display_order)
    VALUES (tpl, 'Canteiro e custos gerais', 5, 9);
  ELSE
    UPDATE public.template_macros SET percentage = 5, display_order = 9
     WHERE template_id = tpl AND name = 'Canteiro e custos gerais';
  END IF;
END $$;

-- ── (B) Tabela de associação item↔etapa + % Previsto por item ────────────────
-- macro_name/item_name em texto (casam com template_macros.name e
-- template_items.name / project_items.name) — durável e fácil de consultar.
CREATE TABLE IF NOT EXISTS public.template_stage_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid REFERENCES public.cost_templates(id) ON DELETE CASCADE,
    macro_name text NOT NULL,      -- etapa (= template_macros.name)
    item_name  text NOT NULL,      -- item  (= template_items.name)
    percentage numeric NOT NULL DEFAULT 0,  -- % do item DENTRO da etapa (soma 100 por etapa)
    optional   boolean NOT NULL DEFAULT false, -- Gás/Climatização/Paisagismo
    display_order integer DEFAULT 0,
    UNIQUE (template_id, macro_name, item_name)
);
ALTER TABLE public.template_stage_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read template_stage_items" ON public.template_stage_items;
CREATE POLICY "read template_stage_items" ON public.template_stage_items
    FOR SELECT TO authenticated USING (true);
GRANT SELECT ON TABLE public.template_stage_items TO authenticated, service_role;

-- Semeia o preset (idempotente: limpa antes). Nomes de item já reconciliados
-- com os 43 de template_items. % de cada bloco fecha 100 dentro da etapa.
DO $$
DECLARE tpl uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  DELETE FROM public.template_stage_items WHERE template_id = tpl;

  INSERT INTO public.template_stage_items (template_id, macro_name, item_name, percentage, optional, display_order) VALUES
  -- 1) Projetos e serviços preliminares (4%)
  (tpl, 'Projetos e serviços preliminares', 'Serviços técnicos',              30, false, 1),
  (tpl, 'Projetos e serviços preliminares', 'Taxas',                          15, false, 2),
  (tpl, 'Projetos e serviços preliminares', 'Mão de obra',                    15, false, 3),
  (tpl, 'Projetos e serviços preliminares', 'Administração e apoio da obra',  15, false, 4),
  (tpl, 'Projetos e serviços preliminares', 'Locação de equipamentos',         8, false, 5),
  (tpl, 'Projetos e serviços preliminares', 'Caçamba',                          7, false, 6),
  (tpl, 'Projetos e serviços preliminares', 'Frete',                            5, false, 7),
  (tpl, 'Projetos e serviços preliminares', 'Ferramentas e EPIs',               5, false, 8),
  -- 2) Terraplenagem e fundações (11%)
  (tpl, 'Terraplenagem e fundações', 'Concreto',                 18, false, 1),
  (tpl, 'Terraplenagem e fundações', 'Mão de obra',              15, false, 2),
  (tpl, 'Terraplenagem e fundações', 'Ferro',                    13, false, 3),
  (tpl, 'Terraplenagem e fundações', 'Aterro',                   12, false, 4),
  (tpl, 'Terraplenagem e fundações', 'Cimento',                   8, false, 5),
  (tpl, 'Terraplenagem e fundações', 'Pedra',                     7, false, 6),
  (tpl, 'Terraplenagem e fundações', 'Madeira',                   7, false, 7),
  (tpl, 'Terraplenagem e fundações', 'Areia',                     5, false, 8),
  (tpl, 'Terraplenagem e fundações', 'Impermeabilização',         5, false, 9),
  (tpl, 'Terraplenagem e fundações', 'Locação de equipamentos',   4, false, 10),
  (tpl, 'Terraplenagem e fundações', 'Frete',                     3, false, 11),
  (tpl, 'Terraplenagem e fundações', 'Tubos e conexões',          2, false, 12),
  (tpl, 'Terraplenagem e fundações', 'Caçamba',                   1, false, 13),
  -- 3) Estrutura e alvenaria (22%)
  (tpl, 'Estrutura e alvenaria', 'Tijolos e blocos',        17, false, 1),
  (tpl, 'Estrutura e alvenaria', 'Concreto',                13, false, 2),
  (tpl, 'Estrutura e alvenaria', 'Ferro',                   12, false, 3),
  (tpl, 'Estrutura e alvenaria', 'Mão de obra',             12, false, 4),
  (tpl, 'Estrutura e alvenaria', 'Lajes e pré-moldados',    10, false, 5),
  (tpl, 'Estrutura e alvenaria', 'Cimento',                  7, false, 6),
  (tpl, 'Estrutura e alvenaria', 'Argamassa',                7, false, 7),
  (tpl, 'Estrutura e alvenaria', 'Madeira',                  6, false, 8),
  (tpl, 'Estrutura e alvenaria', 'Areia',                    5, false, 9),
  (tpl, 'Estrutura e alvenaria', 'Pedra',                    4, false, 10),
  (tpl, 'Estrutura e alvenaria', 'Cal',                      2, false, 11),
  (tpl, 'Estrutura e alvenaria', 'Impermeabilização',        2, false, 12),
  (tpl, 'Estrutura e alvenaria', 'Frete',                    2, false, 13),
  (tpl, 'Estrutura e alvenaria', 'Locação de equipamentos',  1, false, 14),
  -- 4) Cobertura e impermeabilização (9%)
  (tpl, 'Cobertura e impermeabilização', 'Telhas',                  25, false, 1),
  (tpl, 'Cobertura e impermeabilização', 'Impermeabilização',       15, false, 2),
  (tpl, 'Cobertura e impermeabilização', 'Mão de obra',             14, false, 3),
  (tpl, 'Cobertura e impermeabilização', 'Madeira',                 12, false, 4),
  (tpl, 'Cobertura e impermeabilização', 'Lajes e pré-moldados',     8, false, 5),
  (tpl, 'Cobertura e impermeabilização', 'Calhas e rufos',           8, false, 6),
  (tpl, 'Cobertura e impermeabilização', 'Ferro',                    5, false, 7),
  (tpl, 'Cobertura e impermeabilização', 'Concreto',                 5, false, 8),
  (tpl, 'Cobertura e impermeabilização', 'Serralheria',              3, false, 9),
  (tpl, 'Cobertura e impermeabilização', 'Frete',                    3, false, 10),
  (tpl, 'Cobertura e impermeabilização', 'Locação de equipamentos',  2, false, 11),
  -- 5) Instalações elétricas e hidráulicas (14%)  — Gás e Climatização opcionais
  (tpl, 'Instalações elétricas e hidráulicas', 'Mão de obra',             28, false, 1),
  (tpl, 'Instalações elétricas e hidráulicas', 'Materiais elétricos',     27, false, 2),
  (tpl, 'Instalações elétricas e hidráulicas', 'Tubos e conexões',        25, false, 3),
  (tpl, 'Instalações elétricas e hidráulicas', 'Caixa d''água',            8, false, 4),
  (tpl, 'Instalações elétricas e hidráulicas', 'Climatização',             3, true,  5),
  (tpl, 'Instalações elétricas e hidráulicas', 'Frete',                    3, false, 6),
  (tpl, 'Instalações elétricas e hidráulicas', 'Argamassa',                2, false, 7),
  (tpl, 'Instalações elétricas e hidráulicas', 'Gás',                      2, true,  8),
  (tpl, 'Instalações elétricas e hidráulicas', 'Cimento',                  1, false, 9),
  (tpl, 'Instalações elétricas e hidráulicas', 'Locação de equipamentos',  1, false, 10),
  -- 6) Revestimentos, pisos e forros (17%)
  (tpl, 'Revestimentos, pisos e forros', 'Pisos e revestimentos',  25, false, 1),
  (tpl, 'Revestimentos, pisos e forros', 'Mão de obra',            22, false, 2),
  (tpl, 'Revestimentos, pisos e forros', 'Argamassa',              12, false, 3),
  (tpl, 'Revestimentos, pisos e forros', 'Gesso',                   8, false, 4),
  (tpl, 'Revestimentos, pisos e forros', 'Mármore e granito',       8, false, 5),
  (tpl, 'Revestimentos, pisos e forros', 'Cimento',                 5, false, 6),
  (tpl, 'Revestimentos, pisos e forros', 'Areia',                   5, false, 7),
  (tpl, 'Revestimentos, pisos e forros', 'Impermeabilização',       5, false, 8),
  (tpl, 'Revestimentos, pisos e forros', 'Rejunte',                 4, false, 9),
  (tpl, 'Revestimentos, pisos e forros', 'Cal',                     3, false, 10),
  (tpl, 'Revestimentos, pisos e forros', 'Frete',                   3, false, 11),
  -- 7) Esquadrias, pintura e acabamentos (14%)
  (tpl, 'Esquadrias, pintura e acabamentos', 'Pintura',            20, false, 1),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Mão de obra',        14, false, 2),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Portas',             12, false, 3),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Janelas',            12, false, 4),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Louças e metais',    12, false, 5),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Materiais elétricos', 7, false, 6),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Serralheria',         6, false, 7),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Vidros',              5, false, 8),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Mármore e granito',   5, false, 9),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Gesso',               4, false, 10),
  (tpl, 'Esquadrias, pintura e acabamentos', 'Frete',               3, false, 11),
  -- 8) Área externa, ligações e entrega (4%)  — Paisagismo opcional
  (tpl, 'Área externa, ligações e entrega', 'Mão de obra',             12, false, 1),
  (tpl, 'Área externa, ligações e entrega', 'Portões',                 10, false, 2),
  (tpl, 'Área externa, ligações e entrega', 'Tijolos e blocos',         7, false, 3),
  (tpl, 'Área externa, ligações e entrega', 'Concreto',                 7, false, 4),
  (tpl, 'Área externa, ligações e entrega', 'Serralheria',              7, false, 5),
  (tpl, 'Área externa, ligações e entrega', 'Cimento',                  5, false, 6),
  (tpl, 'Área externa, ligações e entrega', 'Pedra',                    5, false, 7),
  (tpl, 'Área externa, ligações e entrega', 'Pisos e revestimentos',    5, false, 8),
  (tpl, 'Área externa, ligações e entrega', 'Pintura',                  5, false, 9),
  (tpl, 'Área externa, ligações e entrega', 'Limpeza final',            5, false, 10),
  (tpl, 'Área externa, ligações e entrega', 'Areia',                    4, false, 11),
  (tpl, 'Área externa, ligações e entrega', 'Ferro',                    4, false, 12),
  (tpl, 'Área externa, ligações e entrega', 'Argamassa',                4, false, 13),
  (tpl, 'Área externa, ligações e entrega', 'Tubos e conexões',         4, false, 14),
  (tpl, 'Área externa, ligações e entrega', 'Taxas',                    4, false, 15),
  (tpl, 'Área externa, ligações e entrega', 'Materiais elétricos',      3, false, 16),
  (tpl, 'Área externa, ligações e entrega', 'Frete',                    3, false, 17),
  (tpl, 'Área externa, ligações e entrega', 'Locação de equipamentos',  3, false, 18),
  (tpl, 'Área externa, ligações e entrega', 'Serviços técnicos',        2, false, 19),
  (tpl, 'Área externa, ligações e entrega', 'Paisagismo',               1, true,  20),
  -- 9) Canteiro e custos gerais (5%)  — recorrentes, presos ao TEMPO
  (tpl, 'Canteiro e custos gerais', 'Administração e apoio da obra', 24, false, 1),
  (tpl, 'Canteiro e custos gerais', 'Ferramentas e EPIs',            16, false, 2),
  (tpl, 'Canteiro e custos gerais', 'Container',                     15, false, 3),
  (tpl, 'Canteiro e custos gerais', 'Caçamba',                       14, false, 4),
  (tpl, 'Canteiro e custos gerais', 'Luz (conta da obra)',           10, false, 5),
  (tpl, 'Canteiro e custos gerais', 'Água (conta da obra)',           8, false, 6),
  (tpl, 'Canteiro e custos gerais', 'Locação de equipamentos',        8, false, 7),
  (tpl, 'Canteiro e custos gerais', 'Mão de obra',                    3, false, 8),
  (tpl, 'Canteiro e custos gerais', 'Frete',                          2, false, 9);
END $$;
