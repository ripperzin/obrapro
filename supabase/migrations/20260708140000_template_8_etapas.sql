-- Novo template padrão de orçamento: 8 etapas na ordem física da obra, SEM submacros (plano Básico).
-- Substitui os macros/submacros antigos do template "Obra Padrão Brasil".
-- Afeta apenas obras NOVAS (o trigger handle_new_project_budget copia o template ao criar o orçamento).
DO $$
DECLARE
  tpl uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  DELETE FROM public.template_sub_macros
   WHERE macro_id IN (SELECT id FROM public.template_macros WHERE template_id = tpl);
  DELETE FROM public.template_macros WHERE template_id = tpl;

  INSERT INTO public.template_macros (template_id, name, percentage, display_order) VALUES
    (tpl, 'Projetos e serviços preliminares',      4,  1),
    (tpl, 'Terraplenagem e fundações',            12,  2),
    (tpl, 'Estrutura e alvenaria',                22,  3),
    (tpl, 'Cobertura e impermeabilização',         8,  4),
    (tpl, 'Instalações elétricas e hidráulicas',  12,  5),
    (tpl, 'Revestimentos, pisos e forros',        18,  6),
    (tpl, 'Esquadrias, pintura e acabamentos',    18,  7),
    (tpl, 'Área externa, ligações e entrega',      6,  8);
END $$;
