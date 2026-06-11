-- ==============================================================================
-- MIGRATION: PLANOS + METERING DE IA (Fase 1 do lançamento self-serve)
-- DATA: 2026-06-11
-- ==============================================================================
-- Prepara a monetização (planos free/pro/business) e protege o custo de IA
-- (OCR Gemini + copiloto Claude) com limite por usuário/mês.
--
-- - profiles.plan: plano atual do usuário (sincronizado pelo webhook do
--   Mercado Pago na Fase 2; default 'free').
-- - subscriptions: estado da assinatura (escrita só via service role/webhook).
-- - ai_usage: contador agregado por usuário e mês (UTC).
-- - check_and_increment_ai_usage(): chamada pelas edge functions (service role)
--   ANTES de cada chamada de IA; decide e incrementa atomicamente. Admin/owner
--   (role='admin') é ilimitado.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------------------
-- 1. PLANO NO PERFIL
-- ------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists plan text not null default 'free';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_plan_check') then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free','pro','business'));
  end if;
end $$;

-- Usuários atuais (donos/admins) ficam em business.
update public.profiles set plan = 'business' where role = 'admin';

-- ------------------------------------------------------------------------------
-- 2. ASSINATURAS (sincronizadas pelo webhook do Mercado Pago na Fase 2)
-- ------------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free','pro','business')),
  status text not null default 'pending' check (status in ('pending','active','past_due','canceled')),
  provider text not null default 'mercadopago',
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid());
-- Sem policy de insert/update/delete para authenticated: só a service role
-- (webhook do Mercado Pago) escreve.

-- ------------------------------------------------------------------------------
-- 3. USO DE IA (agregado por usuário/mês UTC)
-- ------------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,                 -- 'YYYY-MM' (UTC)
  ocr_count int not null default 0,
  copilot_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);
alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own"
  on public.ai_usage for select to authenticated
  using (user_id = auth.uid());
-- Escrita só via service role (edge functions).

-- ------------------------------------------------------------------------------
-- 4. LIMITES POR PLANO (fácil de ajustar; alinhado ao pricing)
--    'business'/admin tratados como praticamente ilimitados.
-- ------------------------------------------------------------------------------
create or replace function public.ai_monthly_limit(p_plan text, p_kind text)
returns int language sql immutable as $$
  select case p_kind
    when 'ocr' then case p_plan
      when 'free' then 0 when 'pro' then 100 when 'business' then 100000 else 0 end
    when 'copilot' then case p_plan
      when 'free' then 0 when 'pro' then 300 when 'business' then 100000 else 0 end
    else 0
  end;
$$;

-- ------------------------------------------------------------------------------
-- 5. CHECA E INCREMENTA ATOMICAMENTE (chamada pela edge function via RPC)
--    Retorna json { allowed, plan, used, limit }.
-- ------------------------------------------------------------------------------
create or replace function public.check_and_increment_ai_usage(p_user uuid, p_kind text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_plan   text;
  v_role   text;
  v_period text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_limit  int;
  v_used   int;
begin
  if p_kind not in ('ocr','copilot') then
    return json_build_object('allowed', false, 'error', 'kind inválido');
  end if;

  select plan, role into v_plan, v_role from public.profiles where id = p_user;
  if v_plan is null then v_plan := 'free'; end if;

  insert into public.ai_usage (user_id, period) values (p_user, v_period)
    on conflict (user_id, period) do nothing;

  -- admin/owner: ilimitado (apenas contabiliza).
  if v_role = 'admin' then
    if p_kind = 'ocr' then
      update public.ai_usage set ocr_count = ocr_count + 1, updated_at = now()
        where user_id = p_user and period = v_period;
    else
      update public.ai_usage set copilot_count = copilot_count + 1, updated_at = now()
        where user_id = p_user and period = v_period;
    end if;
    return json_build_object('allowed', true, 'plan', v_plan, 'unlimited', true);
  end if;

  v_limit := public.ai_monthly_limit(v_plan, p_kind);

  select case when p_kind = 'ocr' then ocr_count else copilot_count end
    into v_used from public.ai_usage where user_id = p_user and period = v_period;

  if v_used >= v_limit then
    return json_build_object('allowed', false, 'plan', v_plan, 'used', v_used, 'limit', v_limit);
  end if;

  if p_kind = 'ocr' then
    update public.ai_usage set ocr_count = ocr_count + 1, updated_at = now()
      where user_id = p_user and period = v_period;
  else
    update public.ai_usage set copilot_count = copilot_count + 1, updated_at = now()
      where user_id = p_user and period = v_period;
  end if;

  return json_build_object('allowed', true, 'plan', v_plan, 'used', v_used + 1, 'limit', v_limit);
end;
$$;

commit;
