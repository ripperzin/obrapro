-- Semeia os submacros padrão MCMV no template (template_sub_macros).
-- Os macros e seus percentuais já foram definidos em migrations anteriores
-- (20260708140000 + 20260709160000). Aqui apenas os SUBMACROS.
-- Afeta obras NOVAS: o trigger handle_new_project_budget copia os subs do
-- template ao criar o orçamento. % interno = divisão igual dentro de cada
-- etapa (somando ~100), editável por obra depois.
-- Idempotente: limpa os subs anteriores do template antes de inserir.
DO $$
DECLARE
  tpl uuid := '00000000-0000-0000-0000-000000000001';
  mid uuid;
BEGIN
  DELETE FROM public.template_sub_macros
   WHERE macro_id IN (SELECT id FROM public.template_macros WHERE template_id = tpl);

  -- 1. Projetos e serviços preliminares (6)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Projetos e serviços preliminares';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Projetos e compatibilização',                    16.67, 1),
    (mid, 'Engenheiro, arquiteto e responsabilidade técnica', 16.67, 2),
    (mid, 'Licenças, alvarás e taxas',                       16.67, 3),
    (mid, 'Topografia, sondagem e locação',                  16.67, 4),
    (mid, 'Limpeza do terreno e preparação do canteiro',     16.67, 5),
    (mid, 'Ligações provisórias e instalações do canteiro',  16.65, 6);

  -- 2. Terraplenagem e fundações (6)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Terraplenagem e fundações';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Escavação e terraplenagem',        16.67, 1),
    (mid, 'Aterro e compactação',             16.67, 2),
    (mid, 'Fundação, baldrame ou radier',     16.67, 3),
    (mid, 'Armação e concretagem',            16.67, 4),
    (mid, 'Impermeabilização da fundação',    16.67, 5),
    (mid, 'Reaterro e preparação do piso',    16.65, 6);

  -- 3. Estrutura e alvenaria (6)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Estrutura e alvenaria';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Estrutura de concreto',                         16.67, 1),
    (mid, 'Lajes, treliças e pré-moldados',                16.67, 2),
    (mid, 'Alvenaria',                                     16.67, 3),
    (mid, 'Vergas, contravergas, pilares e cintas',        16.67, 4),
    (mid, 'Escadas e elementos estruturais',               16.67, 5),
    (mid, 'Chapisco estrutural ou preparação da alvenaria', 16.65, 6);

  -- 4. Cobertura e impermeabilização (6)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Cobertura e impermeabilização';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Estrutura do telhado',                 16.67, 1),
    (mid, 'Telhas e telhamento',                  16.67, 2),
    (mid, 'Calhas, rufos e condutores',           16.67, 3),
    (mid, 'Impermeabilização de lajes',           16.67, 4),
    (mid, 'Impermeabilização de áreas molhadas',  16.67, 5),
    (mid, 'Proteção e isolamento da cobertura',   16.65, 6);

  -- 5. Instalações elétricas e hidráulicas (7)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Instalações elétricas e hidráulicas';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Instalação hidráulica',                        14.29, 1),
    (mid, 'Instalação de esgoto',                         14.29, 2),
    (mid, 'Instalação elétrica',                          14.29, 3),
    (mid, 'Águas pluviais',                               14.29, 4),
    (mid, 'Quadros, fiação, tomadas e interruptores',     14.29, 5),
    (mid, 'Reservatórios, bombas e equipamentos',         14.29, 6),
    (mid, 'Gás, internet e infraestrutura adicional',     14.26, 7);

  -- 6. Revestimentos, pisos e forros (7)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Revestimentos, pisos e forros';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Chapisco, emboço e reboco',                    14.29, 1),
    (mid, 'Contrapiso e regularização',                   14.29, 2),
    (mid, 'Revestimentos de parede',                      14.29, 3),
    (mid, 'Pisos e rodapés',                              14.29, 4),
    (mid, 'Gesso e forros',                               14.29, 5),
    (mid, 'Pedras, mármores, granitos e bancadas',        14.29, 6),
    (mid, 'Rejuntes e acabamentos de revestimento',       14.26, 7);

  -- 7. Esquadrias, pintura e acabamentos (7)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Esquadrias, pintura e acabamentos';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Portas e ferragens',                14.29, 1),
    (mid, 'Janelas',                           14.29, 2),
    (mid, 'Vidros e vidraçaria',               14.29, 3),
    (mid, 'Serralheria e guarda-corpos',       14.29, 4),
    (mid, 'Pintura interna e externa',         14.29, 5),
    (mid, 'Louças e metais',                   14.29, 6),
    (mid, 'Luminárias e acabamentos elétricos', 14.26, 7);

  -- 8. Área externa, ligações e entrega (7)
  SELECT id INTO mid FROM public.template_macros WHERE template_id = tpl AND name = 'Área externa, ligações e entrega';
  INSERT INTO public.template_sub_macros (macro_id, name, percentage, display_order) VALUES
    (mid, 'Muros, cercas e portões',                       14.29, 1),
    (mid, 'Calçadas, passeios e pavimentação',             14.29, 2),
    (mid, 'Drenagem externa',                              14.29, 3),
    (mid, 'Ligações definitivas de água, esgoto e energia', 14.29, 4),
    (mid, 'Paisagismo e áreas externas',                   14.29, 5),
    (mid, 'Limpeza final',                                 14.29, 6),
    (mid, 'Vistorias, Habite-se e entrega',                14.26, 7);
END $$;
