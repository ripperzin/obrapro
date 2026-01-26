-- ==============================================================================
-- FIX: CORREÇÃO DE ERRO 500 (LOOP INFINITO NO RLS)
-- DATA: 25/01/2025
-- ==============================================================================

-- O erro 500 acontece porque a tabela pergunta pra ela mesma se você tem permissão,
-- criando um ciclo infinito. Vamos quebrar esse ciclo criando uma função segura.

-- 1. Função Helper (Roda com poderes de admin para ler permissões sem travar)
create or replace function get_user_projects()
returns setof uuid
language sql
security definer -- IMPORTANTE: Roda como sistema, ignorando RLS
set search_path = public
stable
as $$
  select project_id from project_members where user_id = auth.uid();
$$;

-- 2. Corrigir RLS de Project Members
alter table project_members enable row level security;
drop policy if exists "Members can view project members" on project_members;

create policy "Members can view project members"
  on project_members for select
  using (
    -- Admin vê tudo
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    -- Você vê membros de projetos que você participa (via função segura)
    project_id in (select get_user_projects())
  );

-- 3. Corrigir RLS de Projects (Usando a função segura também, mais rápido)
drop policy if exists "Users can view own projects" on projects;

create policy "Users can view own projects"
  on projects for select
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    id in (select get_user_projects()) -- Muito mais eficiente e seguro
  );

-- 4. Re-aplicar permissão de Owner (via Email) SÓ PARA GARANTIR
-- Caso o erro 500 tenha impedido o script anterior de funcionar.
insert into public.project_members (project_id, user_id, role)
select 
    p.id as project_id,
    u.id as user_id,
    'owner' as role
from projects p
cross join auth.users u
where u.email ilike 'victoravila%' 
   OR u.email = 'admin@obrapro.com'
on conflict (project_id, user_id) 
do update set role = 'owner';
