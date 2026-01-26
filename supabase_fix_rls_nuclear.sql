-- ==============================================================================
-- FIX: CORREÇÃO "NUCLEAR" DE RLS (PARA MATAR O ERRO 500 DE VEZ)
-- DATA: 25/01/2025
-- ==============================================================================

-- 1. FUNÇÕES SEGURAS (SECURITY DEFINER)
-- Elas rodam com privilégio total, pulando as policies, para evitar o loop.

-- Check Admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() 
    and role = 'admin'
  );
$$;

-- Get My Projects
create or replace function public.get_my_projects()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select project_id from project_members where user_id = auth.uid();
$$;

-- 2. LIMPEZA TOTAL DE POLICIES (Para garantir que não sobrou lixo)
drop policy if exists "Public profiles are viewable by everyone" on profiles;
drop policy if exists "Users can insert their own profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;

drop policy if exists "Members can view project members" on project_members;

drop policy if exists "Users can view own projects" on projects;
drop policy if exists "Users can create projects" on projects;
drop policy if exists "Editors can update projects" on projects;
drop policy if exists "Owners can delete projects" on projects;

-- 3. RE-APLICAR POLICIES SIMPLIFICADAS (Usando as funções)

-- PROFILES (Simples)
create policy "Public profiles are viewable by everyone" 
on profiles for select using (true);

create policy "Users can insert their own profile" 
on profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile" 
on profiles for update using (auth.uid() = id);

-- PROJECT MEMBERS (Usando is_admin)
create policy "Members can view project members"
  on project_members for select
  using (
    is_admin() 
    OR 
    project_id in (select get_my_projects())
  );

-- PROJECTS (Usando is_admin e get_my_projects)
create policy "Users can view own projects"
  on projects for select
  using (
    is_admin()
    OR
    id in (select get_my_projects())
  );

create policy "Users can create projects"
  on projects for insert
  with check ( auth.role() = 'authenticated' );

create policy "Editors can update projects"
  on projects for update
  using (
    is_admin()
    OR
    id in (select get_my_projects()) 
    AND auth.uid() in (select user_id from project_members where project_id = id and role in ('owner', 'editor'))
  );

create policy "Owners can delete projects"
  on projects for delete
  using (
    is_admin()
    OR
    id in (select get_my_projects()) 
    AND auth.uid() in (select user_id from project_members where project_id = id and role = 'owner')
  );

-- 4. RE-FORÇAR O ACESSO (Just in Case)
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
