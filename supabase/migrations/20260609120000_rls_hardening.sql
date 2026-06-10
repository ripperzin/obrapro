-- ==============================================================================
-- MIGRATION: RLS HARDENING (ESTADO FINAL CONSOLIDADO)
-- DATA: 2026-06-09
-- ==============================================================================
-- Objetivo: eliminar o vazamento de dados entre clientes.
--
-- Estado anterior (INSEGURO):
--   * supabase_investor_access.sql liberava SELECT para o role `anon` com
--     using(true) em projects/units/expenses/budgets/macros/sub_macros/
--     stage_evidences -> QUALQUER pessoa com a chave anônima (embutida no app)
--     lia o banco INTEIRO sem login.
--   * diary_entries/documents/stage_evidences/project_budgets/project_macros
--     tinham policies `authenticated using(true)` -> qualquer usuário logado
--     via os dados de TODOS os clientes.
--
-- Estratégia: dado o histórico de 30+ scripts soltos, NÃO confiamos nos nomes
-- das policies existentes. Derrubamos TODAS as policies das tabelas de domínio
-- e recriamos um conjunto único, escopado por participação na obra
-- (project_members), usando funções SECURITY DEFINER para evitar recursão.
--
-- O Portal do Investidor deixa de ler o banco via `anon`; passa a ser servido
-- pela edge function `investor-portal` (service role, devolve só 1 obra).
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. FUNÇÕES HELPER (SECURITY DEFINER -> rodam como sistema, ignoram RLS,
--    quebrando qualquer recursão de policy)
-- ------------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Mantida por compatibilidade com policies/códigos legados que a referenciam.
create or replace function public.get_my_projects()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select project_id from public.project_members where user_id = auth.uid();
$$;

-- Acesso de LEITURA: admin OU membro (qualquer papel) da obra.
create or replace function public.can_access_project(pid uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select public.is_admin() or exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid()
  );
$$;

-- Acesso por PAPEL (para escrita/exclusão da própria obra).
create or replace function public.has_project_role(pid uuid, roles text[])
returns boolean
language sql security definer set search_path = public stable
as $$
  select public.is_admin() or exists (
    select 1 from public.project_members
    where project_id = pid and user_id = auth.uid() and role = any(roles)
  );
$$;

-- Resolvem a obra de tabelas que se ligam indiretamente (bypass de RLS).
create or replace function public.project_id_of_budget(b_id uuid)
returns uuid
language sql security definer set search_path = public stable
as $$
  select project_id from public.project_budgets where id = b_id;
$$;

create or replace function public.project_id_of_macro(m_id uuid)
returns uuid
language sql security definer set search_path = public stable
as $$
  select b.project_id
  from public.project_macros m
  join public.project_budgets b on b.id = m.budget_id
  where m.id = m_id;
$$;

-- ------------------------------------------------------------------------------
-- 2. LIMPEZA TOTAL: derruba toda policy existente nas tabelas de domínio.
--    Garante que nenhum `using(true)` legado sobreviva, independente do nome.
-- ------------------------------------------------------------------------------
do $$
declare
  r record;
  tbls text[] := array[
    'profiles','project_members','projects','units','expenses','logs',
    'diary_entries','documents','stage_evidences',
    'project_budgets','project_macros','project_sub_macros'
  ];
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any(tbls)
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- 3. GARANTIR RLS ATIVO EM TODAS AS TABELAS DE DOMÍNIO
-- ------------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.project_members     enable row level security;
alter table public.projects            enable row level security;
alter table public.units               enable row level security;
alter table public.expenses            enable row level security;
alter table public.logs                enable row level security;
alter table public.diary_entries       enable row level security;
alter table public.documents           enable row level security;
alter table public.stage_evidences     enable row level security;
alter table public.project_budgets     enable row level security;
alter table public.project_macros      enable row level security;
alter table public.project_sub_macros  enable row level security;

-- ------------------------------------------------------------------------------
-- 4. PROFILES
--    Perfis são "públicos" entre usuários autenticados (nome para exibição),
--    mas NÃO para anônimos. Cada um só edita o próprio.
-- ------------------------------------------------------------------------------
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

create policy "profiles_insert_self"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "profiles_update_self"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 5. PROJECT_MEMBERS
-- ------------------------------------------------------------------------------
create policy "members_select"
  on public.project_members for select to authenticated
  using (is_admin() or project_id in (select get_my_projects()));

-- Inserção de membros: admin ou owner da obra. (O criador é inserido pelo
-- trigger handle_new_project, que é SECURITY DEFINER e ignora esta checagem.)
create policy "members_insert"
  on public.project_members for insert to authenticated
  with check (has_project_role(project_id, array['owner']));

create policy "members_update"
  on public.project_members for update to authenticated
  using (has_project_role(project_id, array['owner']));

create policy "members_delete"
  on public.project_members for delete to authenticated
  using (has_project_role(project_id, array['owner']));

-- ------------------------------------------------------------------------------
-- 6. PROJECTS
-- ------------------------------------------------------------------------------
create policy "projects_select"
  on public.projects for select to authenticated
  using (can_access_project(id));

create policy "projects_insert"
  on public.projects for insert to authenticated
  with check (auth.uid() is not null);

create policy "projects_update"
  on public.projects for update to authenticated
  using (has_project_role(id, array['owner','editor']));

create policy "projects_delete"
  on public.projects for delete to authenticated
  using (has_project_role(id, array['owner']));

-- ------------------------------------------------------------------------------
-- 7. TABELAS-FILHAS COM project_id DIRETO
--    Leitura e escrita liberadas a qualquer MEMBRO da obra.
-- ------------------------------------------------------------------------------
create policy "units_all"
  on public.units for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

create policy "expenses_all"
  on public.expenses for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

create policy "logs_all"
  on public.logs for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

create policy "diary_entries_all"
  on public.diary_entries for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

create policy "documents_all"
  on public.documents for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

create policy "stage_evidences_all"
  on public.stage_evidences for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

create policy "project_budgets_all"
  on public.project_budgets for all to authenticated
  using (can_access_project(project_id))
  with check (can_access_project(project_id));

-- ------------------------------------------------------------------------------
-- 8. TABELAS-FILHAS COM LIGAÇÃO INDIRETA (resolvidas por função SECURITY DEFINER)
-- ------------------------------------------------------------------------------
create policy "project_macros_all"
  on public.project_macros for all to authenticated
  using (can_access_project(project_id_of_budget(budget_id)))
  with check (can_access_project(project_id_of_budget(budget_id)));

create policy "project_sub_macros_all"
  on public.project_sub_macros for all to authenticated
  using (can_access_project(project_id_of_macro(project_macro_id)))
  with check (can_access_project(project_id_of_macro(project_macro_id)));

-- ------------------------------------------------------------------------------
-- 9. NOTA SOBRE O ROLE `anon`
--    Nenhuma policy acima concede acesso a `anon`. Com RLS ativo e sem policy
--    para anon, o role anônimo NÃO lê nenhuma destas tabelas. O Portal do
--    Investidor passa a ser servido exclusivamente pela edge function
--    `investor-portal` (service role).
-- ------------------------------------------------------------------------------

commit;

-- ==============================================================================
-- PENDÊNCIA CONHECIDA (fora do escopo desta migration):
-- O bucket de Storage 'project-documents' ainda permite que QUALQUER usuário
-- autenticado leia/baixe arquivos de QUALQUER obra (policy `to authenticated`
-- sem escopo por obra). Não é exposição anônima, mas é cross-tenant entre
-- usuários logados. Corrigir exige padronizar o caminho dos arquivos como
-- "<project_id>/arquivo" e escopar a policy por isso. Tratar antes de abrir
-- cadastro para clientes que compartilham a mesma instância.
-- ==============================================================================
