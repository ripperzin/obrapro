-- ============================================================================
-- Controles do dono do app sobre o cliente: BLOQUEIO e CORTESIA (dias grátis).
--   blocked      = conta suspensa (parou de pagar) sem apagar os dados.
--   trial_until  = ObraPro de cortesia até esta data; vencida, cai sozinho no
--                  plano base (não apaga nada, só destrava/trava o pago).
-- Ninguém além do dono do app mexe nisso: o GRANT de UPDATE do `authenticated`
-- em profiles é só (full_name, phone); estas colunas só mudam pela edge function
-- admin-actions (service role) — o cliente não se auto-promove nem se desbloqueia.
-- ============================================================================
alter table public.profiles
  add column if not exists blocked     boolean not null default false,
  add column if not exists trial_until date;

-- admin_overview() passa a devolver blocked e trial_until, pro painel mostrar o
-- status e o botão certo. Recriada inteira (Postgres exige DROP p/ mudar o tipo
-- de retorno de uma função que já existe).
drop function if exists public.admin_overview();

create function public.admin_overview()
returns table (
  id                uuid,
  email             text,
  full_name         text,
  phone             text,
  role              text,
  plan              text,
  blocked           boolean,
  trial_until       date,
  criado_em         timestamptz,
  ultimo_login      timestamptz,
  obras             int,
  obras_ativas      int,
  despesas          int,
  ultimo_lancamento date,
  ocr_mes           int,
  copiloto_mes      int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado: apenas o dono do app.' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.email,
    p.full_name,
    p.phone,
    coalesce(p.role, 'user')  as role,
    coalesce(p.plan, 'free')  as plan,
    coalesce(p.blocked, false) as blocked,
    p.trial_until,
    p.created_at              as criado_em,
    u.last_sign_in_at         as ultimo_login,
    (select count(*)::int from project_members m where m.user_id = p.id) as obras,
    (select count(*)::int from project_members m
       join projects pr on pr.id = m.project_id
      where m.user_id = p.id and coalesce(pr.archived, false) = false)   as obras_ativas,
    (select count(*)::int from expenses e where e.user_id = p.id)        as despesas,
    (select max(e.date)      from expenses e where e.user_id = p.id)     as ultimo_lancamento,
    coalesce((select a.ocr_count     from ai_usage a
               where a.user_id = p.id and a.period = to_char(now(), 'YYYY-MM')), 0) as ocr_mes,
    coalesce((select a.copilot_count from ai_usage a
               where a.user_id = p.id and a.period = to_char(now(), 'YYYY-MM')), 0) as copiloto_mes
  from profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
