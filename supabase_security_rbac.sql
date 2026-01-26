-- ==============================================================================
-- MIGRATION: SEGURANÇA RBAC (Role Based Access Control)
-- DATA: 25/01/2025
-- AUTOR: Antigravity Agent
-- ==============================================================================

-- 1. Tabela PROFILES (Extensão do auth.users)
-- Guarda informações públicas/globais do usuário
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'user'::text, -- 'admin' | 'user'
  created_at timestamptz default now(),
  primary key (id)
);

-- Ativar RLS em Profiles
alter table public.profiles enable row level security;

-- Policy: Todo mundo pode ler perfis (para colaboração), apenas dono edita
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using ( true );

create policy "Users can insert their own profile"
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );

-- 2. Tabela PROJECT_MEMBERS (Membros do Projeto)
-- Liga usuários a projetos com permissões específicas
create table if not exists public.project_members (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text default 'editor'::text, -- 'owner' | 'editor' | 'viewer'
  joined_at timestamptz default now(),
  unique(project_id, user_id)
);

-- Ativar RLS em Project Members
alter table public.project_members enable row level security;

-- Policy: Membros podem ver quem mais está no projeto
create policy "Members can view project members"
  on project_members for select
  using (
    -- Admin vê tudo
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    -- Ou se eu sou membro deste projeto
    auth.uid() in (
      select user_id from project_members pm where pm.project_id = project_members.project_id
    )
  );

-- 3. TRIGGER: Criar Profile automático ao cadastrar
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'user' -- Todo mundo nasce como user, admins são promovidos manualmente
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger connect
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. ATUALIZAR RLS DE PROJECTS (O GRANDE BLOCKER)
alter table projects enable row level security;

-- Policy: Ver projetos
create policy "Users can view own projects"
  on projects for select
  using (
    -- Admin vê tudo
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    -- Membro do projeto
    auth.uid() in (select user_id from project_members where project_id = id)
    OR
    -- (Opcional) Se for Owner direto na tabela projects (legado)
    auth.uid()::text = user_id -- Assumindo que user_id em projects é texto, se for uuid remover ::text
  );

-- Policy: Criar projetos
create policy "Users can create projects"
  on projects for insert
  with check ( auth.role() = 'authenticated' );

-- Policy: Editar projetos
create policy "Editors can update projects"
  on projects for update
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    auth.uid() in (select user_id from project_members where project_id = id and role in ('owner', 'editor'))
    OR
    auth.uid()::text = user_id -- Legado
  );

-- Policy: Deletar projetos
create policy "Owners can delete projects"
  on projects for delete
  using (
    (select role from profiles where id = auth.uid()) = 'admin'
    OR
    auth.uid() in (select user_id from project_members where project_id = id and role = 'owner')
    OR
    auth.uid()::text = user_id -- Legado
  );

-- 5. TRIGGER: Auto-add criador como membro
-- Quando criar projeto, adicionar o criador como 'owner' em project_members
create or replace function public.handle_new_project()
returns trigger as $$
begin
  -- Tenta inserir em project_members
  -- Note: new.user_id na tabela projects pode ser string ou uuid. Casting para uuid.
  begin
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.user_id::uuid, 'owner');
  exception when others then
    -- Ignora erro se user_id não for uuid válido (ex: seeds antigos)
  end;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_project_created on projects;
create trigger on_project_created
  after insert on projects
  for each row execute procedure public.handle_new_project();


-- ==============================================================================
-- 6. MIGRAÇÃO DE DADOS EXISTENTES (SEED ADMIN)
-- ==============================================================================
-- Substitua 'SEU_EMAIL_AQUI' pelo seu email de login atual (ex: victor@...)

-- A. Inserir Profiles para usuários existentes que não tem
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- B. Promover Admin (AJUSTE MANUAL NECESSÁRIO NO CONSOLE SE NÃO souber o ID)
-- update public.profiles set role = 'admin' where email like 'victoravila%';

-- C. Migrar donos atuais para project_members
insert into public.project_members (project_id, user_id, role)
select p.id, u.id, 'owner'
from projects p
join auth.users u on p.user_id = u.id::text -- Assumindo que projects.user_id guarda o ID do auth como texto
on conflict (project_id, user_id) do nothing;
