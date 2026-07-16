-- Atualiza os percentuais do template padrão "Obra Padrão Brasil" para a nova
-- divisão de custo por etapa (soma 100). Afeta apenas obras NOVAS (o trigger
-- handle_new_project_budget copia o template ao criar o orçamento).
-- Obras existentes mantêm seus próprios percentuais (editáveis no Orçamento).
DO $$
DECLARE
  tpl uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE public.template_macros SET percentage = 4  WHERE template_id = tpl AND name = 'Projetos e serviços preliminares';
  UPDATE public.template_macros SET percentage = 12 WHERE template_id = tpl AND name = 'Terraplenagem e fundações';
  UPDATE public.template_macros SET percentage = 23 WHERE template_id = tpl AND name = 'Estrutura e alvenaria';
  UPDATE public.template_macros SET percentage = 9  WHERE template_id = tpl AND name = 'Cobertura e impermeabilização';
  UPDATE public.template_macros SET percentage = 14 WHERE template_id = tpl AND name = 'Instalações elétricas e hidráulicas';
  UPDATE public.template_macros SET percentage = 18 WHERE template_id = tpl AND name = 'Revestimentos, pisos e forros';
  UPDATE public.template_macros SET percentage = 15 WHERE template_id = tpl AND name = 'Esquadrias, pintura e acabamentos';
  UPDATE public.template_macros SET percentage = 5  WHERE template_id = tpl AND name = 'Área externa, ligações e entrega';
END $$;
