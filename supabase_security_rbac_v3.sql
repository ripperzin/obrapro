-- ==============================================================================
-- MIGRATION: SEGURANÇA RBAC (V3 - FINAL)
-- DATA: 25/01/2025
-- AUTOR: Antigravity Agent
-- ==============================================================================

-- 1. Tabela PROFILES
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'user'::text, 
  created_at timestamptz default now(),
  primary key (id)
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- 2. Tabela PROJECT_MEMBERS
create table if not exists public.project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text default 'editor'::text,
  joined_at timestamptz default now(),
  unique(project_id, user_id)
);

alter table public.project_members enable row level security;

create policy "Members can view project members"
  on project_members for select
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    auth.uid() in (select user_id from project_members pm where pm.project_id = project_members.project_id)
  );

-- 3. TRIGGER: Profile Automático
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. ATUALIZAR RLS DE PROJECTS (SEM user_id)
alter table projects enable row level security;

-- Drop policies antigas se existirem para evitar conflito
drop policy if exists "Users can view own projects" on projects;
drop policy if exists "Users can create projects" on projects;
drop policy if exists "Editors can update projects" on projects;
drop policy if exists "Owners can delete projects" on projects;

create policy "Users can view own projects"
  on projects for select
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    auth.uid() in (select user_id from project_members where project_id = id)
  );

create policy "Users can create projects"
  on projects for insert
  with check ( auth.role() = 'authenticated' );

create policy "Editors can update projects"
  on projects for update
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    auth.uid() in (select user_id from project_members where project_id = id and role in ('owner', 'editor'))
  );

create policy "Owners can delete projects"
  on projects for delete
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    auth.uid() in (select user_id from project_members where project_id = id and role = 'owner')
  );

-- 5. TRIGGER: Auto-add criador como membro
create or replace function public.handle_new_project()
returns trigger as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_project_created on projects;
create trigger on_project_created
  after insert on projects
  for each row execute procedure public.handle_new_project();

-- ==============================================================================
-- 6. MIGRAÇÃO DE DADOS (USANDO LOGS COM CAST SEGURO)
-- ==============================================================================

-- A. Inserir Profiles
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- B. Descobrir donos via tabela de LOGS
-- Correção: Convertendo user_id para text antes do regex, depois cast para uuid
insert into public.project_members (project_id, user_id, role)
select distinct
    l.project_id, -- assumindo que project_id em logs já é uuid, senão: l.project_id::uuid
    l.user_id,    -- logs também guarda uuid direto
    'owner'
from logs l
where l.action = 'Criação'
  -- Adicionado cast ::text para evitar erro com coluna UUID
  and l.user_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (project_id, user_id) do nothing;

-- C. FAILSAFE: Se sobrar projeto sem dono, atribui a VOCÊ
insert into public.project_members (project_id, user_id, role)
select p.id, auth.uid(), 'owner'
from projects p
where not exists (select 1 from project_members pm where pm.project_id = p.id)
on conflict (project_id, user_id) do nothing;

-- D. Garantir que VOCÊ é Admin
update public.profiles 
set role = 'admin' 
where id = auth.uid();
