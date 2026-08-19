-- Cadastro self-service não logava: o gatilho não gravava o APELIDO.
--
-- O login por apelido resolve o e-mail assim (função email_for_login):
--     select email from profiles where lower(login) = lower($1)
-- e o gatilho inseria só (id, email, full_name, role) — nunca `login`. Então
-- quem se cadastrava sozinho ouvia "Login não encontrado" e nunca entrava.
-- (Retrato da versão anterior em 20260817140000_objetos_que_so_existiam_em_prod.sql.)
--
-- Agora:
--   1. usa o apelido escolhido no cadastro (user_metadata.login);
--   2. se não veio, deriva do e-mail (parte antes do @);
--   3. garante unicidade sozinho (joao, joao2, joao3...), porque o índice
--      profiles_login_lower_uidx é único em lower(login);
--   4. NUNCA derruba a criação da conta: se o apelido falhar por qualquer
--      motivo, grava o perfil sem apelido. Um gatilho que estoura aqui
--      quebraria TODA criação de usuário — inclusive a tela "Minha equipe" e o
--      painel do dono, que hoje funcionam.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base  text;
  v_login text;
  i       int := 1;
begin
  -- 1/2. apelido escolhido no cadastro, senão a parte do e-mail antes do @
  v_base := lower(nullif(trim(new.raw_user_meta_data->>'login'), ''));
  if v_base is null then
    v_base := lower(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  -- só o que o app aceita como apelido (letras, números, ponto, hífen, _)
  v_base := regexp_replace(v_base, '[^a-z0-9._-]', '', 'g');
  if length(coalesce(v_base, '')) < 3 then
    v_base := 'user' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  -- 3. acha um livre (o índice é o juiz final; isto só evita a colisão comum)
  v_login := v_base;
  while exists (select 1 from public.profiles p where lower(p.login) = v_login) loop
    i := i + 1;
    v_login := v_base || i::text;
    if i > 99 then
      v_login := v_base || substr(replace(new.id::text, '-', ''), 1, 6);
      exit;
    end if;
  end loop;

  begin
    insert into public.profiles (id, email, full_name, role, login)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user', v_login);
  exception when others then
    -- 4. rede de segurança: perfil sem apelido é consertável depois; conta que
    -- não nasce, não. O dono preenche o apelido pelo painel se cair aqui.
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user')
    on conflict (id) do nothing;
  end;

  return new;
end;
$function$;
