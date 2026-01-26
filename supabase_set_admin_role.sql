-- ==============================================================================
-- FIX: FORÇAR ROLE ADMIN NO PERFIL
-- O debug mostrou que seu usuário está com role 'user' (STANDARD).
-- Este script força a atualização para 'admin'.
-- ==============================================================================

update public.profiles
set role = 'admin'
from auth.users
where profiles.id = auth.users.id
  and (
    auth.users.email ilike 'victoravila%' 
    OR 
    auth.users.email = 'admin@obrapro.com'
  );

-- Verifica se funcionou
select email, role from profiles p
join auth.users u on u.id = p.id
where u.email ilike 'victoravila%';
