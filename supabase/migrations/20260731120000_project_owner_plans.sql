-- project_owner_plans(): pro cada obra que o usuário logado ACESSA (é membro),
-- devolve o plano do DONO da obra (project_members.role='owner').
--
-- Motivo: o app precisa liberar as features do plano do PATRÃO pro funcionário
-- DENTRO da obra dele (senão o funcionário free fica algemado numa obra de conta
-- Construtora). O RLS de `profiles` não deixa o funcionário ler o perfil do dono,
-- então isto é SECURITY DEFINER — mas só devolve o plano dos donos das obras onde
-- o próprio caller já é membro (filtro `pm.user_id = auth.uid()`), nada além.
create or replace function public.project_owner_plans()
returns table(project_id uuid, plan text, trial_until text)
language sql
security definer
set search_path = public
as $$
  select pm.project_id,
         pr.plan::text,
         to_char(pr.trial_until, 'YYYY-MM-DD') as trial_until
  from project_members pm
  join project_members owner_pm
    on owner_pm.project_id = pm.project_id and owner_pm.role = 'owner'
  join profiles pr on pr.id = owner_pm.user_id
  where pm.user_id = auth.uid();
$$;

grant execute on function public.project_owner_plans() to authenticated;
