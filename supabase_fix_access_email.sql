-- ==============================================================================
-- FIX: FORÇAR ACESSO (VIA EMAIL)
-- O editor SQL do Supabase não sabe quem está logado (auth.uid() é null).
-- Por isso vamos buscar seu ID pelo email.
-- ==============================================================================

insert into public.project_members (project_id, user_id, role)
select 
    p.id as project_id,
    u.id as user_id,
    'owner' as role
from projects p
cross join auth.users u
where u.email ilike 'victoravila%' -- Busca qualquer email que comece com victoravila
   OR u.email = 'admin@obrapro.com'
on conflict (project_id, user_id) 
do update set role = 'owner';

-- Verifica quantos foram atualizados
select count(*) as projetos_recuperados from project_members;
