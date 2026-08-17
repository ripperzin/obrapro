-- Objetos que existiam SÓ em produção (nunca passaram por migration).
-- Extraídos do banco de prod em 17/08/2026 com pg_get_functiondef/pg_get_triggerdef,
-- exatamente como estavam rodando. Este arquivo é a cópia de segurança deles:
-- se prod perder qualquer um, ninguém entra no app (handle_new_user/email_for_login)
-- ou o orçamento para de acompanhar a obra (os fn_sync_*).
--
-- Achado no dia em que os 2 primeiros usuários externos entraram: mexer no gatilho
-- de cadastro (o conserto do login self-service) sem ter isto versionado seria
-- mexer no escuro. Rodar este arquivo num banco novo recria tudo igual.
--
-- NÃO editar à mão sem aplicar em prod: aqui é retrato, não fonte da verdade ainda.
CREATE OR REPLACE FUNCTION public.check_and_increment_ai_usage(p_user uuid, p_kind text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.email_for_login(p_login text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select email from public.profiles where lower(login) = lower(p_login) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_budget_to_macros()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE project_macros 
    SET 
        estimated_value = (NEW.total_estimated * percentage) / 100.0
    WHERE budget_id = NEW.id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_project_to_budget()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE project_budgets 
    SET 
        total_estimated = NEW.expected_total_cost,
        updated_at = NOW()
    WHERE project_id = NEW.id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_sync_units_to_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE projects 
        SET 
            expected_total_cost = (SELECT COALESCE(SUM(cost), 0) FROM units WHERE project_id = OLD.project_id),
            expected_total_sales = (SELECT COALESCE(SUM(COALESCE(sale_value, valor_estimado_venda, 0)), 0) FROM units WHERE project_id = OLD.project_id),
            unit_count = (SELECT COUNT(*) FROM units WHERE project_id = OLD.project_id)
        WHERE id = OLD.project_id;
        RETURN OLD;
    ELSE
        UPDATE projects 
        SET 
            expected_total_cost = (SELECT COALESCE(SUM(cost), 0) FROM units WHERE project_id = NEW.project_id),
            expected_total_sales = (SELECT COALESCE(SUM(COALESCE(sale_value, valor_estimado_venda, 0)), 0) FROM units WHERE project_id = NEW.project_id),
            unit_count = (SELECT COUNT(*) FROM units WHERE project_id = NEW.project_id)
        WHERE id = NEW.project_id;
        RETURN NEW;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_projects()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select project_id from project_members where user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_editor(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
    and user_id = auth.uid()
    and role in ('owner', 'editor')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
    and user_id = auth.uid()
    and role = 'owner'
  );
$function$
;

-- gatilho em auth.users
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
