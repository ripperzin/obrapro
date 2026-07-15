-- ==============================================================================
-- CORREÇÃO DE SEGURANÇA CRÍTICA: profiles (escalada de privilégio)
-- DATA: 2026-07-15
-- ==============================================================================
-- ⚠️ ESTE BURACO ESTÁ VIVO EM PRODUÇÃO desde 2026-06-09 — e, ironicamente,
-- veio DENTRO da migration de "hardening" de RLS (20260609120000:139):
--
--   create policy "profiles_update_self" on public.profiles
--     for update to authenticated using (auth.uid() = id);
--
-- Ela diz "o usuário pode editar a própria ficha", mas não diz QUAIS COLUNAS.
-- Como `can_access_project()` é `is_admin() or participa da obra`, qualquer
-- pessoa logada fazia, do console do navegador:
--
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', <meu id>)
--
-- ...e passava a ver a obra de TODOS os clientes. O mesmo caminho grava
-- plan='business': derruba o gating de planos e libera IA ilimitada (custo
-- real). Também não havia WITH CHECK.
--
-- Além disso, `profiles_select_authenticated using (true)` deixava todo cliente
-- ler o e-mail de todos os outros.
--
-- SOLUÇÃO
-- 1. Privilégio por COLUNA: o usuário só escreve full_name e phone. `role` e
--    `plan` deixam de ser alcançáveis pelo cliente — quem os define é a service
--    role (trigger de cadastro, webhook de pagamento, admin no painel).
--    Isto é mais forte que policy: nem uma policy futura mal escrita reabre.
-- 2. WITH CHECK na policy de update (a linha continua sendo a dele depois).
-- 3. SELECT escopado: a própria ficha, ou admin.
--
-- NÃO QUEBRA O APP: hoje o app só LÊ profiles (App.tsx monta o usuário logado;
-- UserManagement lista todos, e é tela de admin). Nenhum caminho do app grava.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. ESCRITA: só as colunas inofensivas, e só na própria linha
-- ------------------------------------------------------------------------------
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);   -- faltava: a linha tem que continuar sendo a dele

-- A trava de verdade: privilégio por coluna. `role` e `plan` ficam fora.
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ------------------------------------------------------------------------------
-- 2. LEITURA: a própria ficha, ou admin (antes: todo mundo lia todo mundo)
--    is_admin() é SECURITY DEFINER — não recria a recursão de RLS.
-- ------------------------------------------------------------------------------
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

commit;
