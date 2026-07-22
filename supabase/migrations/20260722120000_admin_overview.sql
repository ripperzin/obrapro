-- ============================================================================
-- Painel do DONO DO APP: uma consulta agregada com os clientes.
--
-- Régua de privacidade: CONTAGEM sim, CONTEÚDO não. Devolve quantas obras,
-- quantos lançamentos, quando mexeu, quanto de IA consumiu — nunca nome de
-- obra, valor, foto ou nota fiscal. Quem quiser o conteúdo tem que entrar na
-- obra (e isso passa pela trava normal de acesso).
--
-- SECURITY DEFINER porque precisa ler `auth.users` (último login), que o app
-- não alcança. A trava é o is_admin() logo na entrada: hoje só o dono do app
-- é admin; quem se cadastra nasce 'user'.
-- ============================================================================
create or replace function public.admin_overview()
returns table (
  id                uuid,
  email             text,
  full_name         text,
  phone             text,
  role              text,
  plan              text,
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
