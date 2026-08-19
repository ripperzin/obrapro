// Edge Function: signup
// Cadastro do CLIENTE NOVO (quem entra sozinho, sem ninguém criar a conta).
//
// Por que existe uma função no servidor pra isso, em vez do cadastro comum:
//  1. O apelido (login) precisa ser único e é o que a pessoa vai digitar todo
//     dia. Validando no servidor, ela recebe "esse apelido já existe, escolha
//     outro" ANTES da conta nascer — em vez de virar "joao2" sem saber e depois
//     não conseguir entrar.
//  2. A conta já nasce valendo (email_confirm), como no painel do dono. Antes o
//     cadastro criava a conta e a pessoa NUNCA conseguia entrar: o gatilho não
//     gravava o apelido e o e-mail nascia sem confirmar. Cadastro que não loga.
//
// Espelha as regras do create_user do admin-actions de propósito — mesma
// validação, mesmo jeito de criar. O que muda é só quem pode chamar (aqui,
// qualquer um) e o plano, que nasce sempre 'free'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOGIN_RE = /^[a-zA-Z0-9._-]{3,}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceKey) return json({ error: "Servidor não configurado." }, 500);

        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

        const body = await req.json().catch(() => ({}));
        const login = String(body.login || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");
        const full_name = String(body.fullName || "").trim();

        if (!LOGIN_RE.test(login)) {
            return json({ error: "Apelido inválido: use letras, números, ponto, hífen ou _ (mínimo 3)." }, 400);
        }
        if (!EMAIL_RE.test(email)) return json({ error: "E-mail inválido." }, 400);
        if (password.length < 6) return json({ error: "A senha precisa de ao menos 6 caracteres." }, 400);

        // Apelido é único sem diferenciar maiúscula (índice profiles_login_lower_uidx).
        const { data: jaExiste } = await admin.from("profiles").select("id").ilike("login", login).maybeSingle();
        if (jaExiste) return json({ error: "Esse apelido já está em uso. Escolha outro." }, 400);

        const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,                 // entra na hora; não depende de e-mail chegar
            user_metadata: { full_name, login },
        });
        if (cErr) {
            const msg = String(cErr.message || "");
            // O Supabase responde em inglês; aqui a pessoa está criando a conta dela.
            if (/already registered|already been registered/i.test(msg)) {
                return json({ error: "Já existe uma conta com esse e-mail. Tente entrar." }, 400);
            }
            return json({ error: msg }, 400);
        }

        const uid = created.user?.id;
        if (!uid) return json({ error: "Falha ao criar a conta." }, 500);

        // O gatilho handle_new_user já grava o apelido vindo do user_metadata.
        // Reforçamos aqui (nome/plano) e tratamos a corrida do índice único.
        const { error: uErr } = await admin.from("profiles")
            .update({ full_name, login, plan: "free" }).eq("id", uid);
        if (uErr) {
            if ((uErr as { code?: string }).code === "23505") {
                await admin.auth.admin.deleteUser(uid);   // não deixa conta órfã
                return json({ error: "Esse apelido acabou de ser usado. Escolha outro." }, 400);
            }
            return json({ error: uErr.message }, 400);
        }

        return json({ ok: true, login });
    } catch (e) {
        return json({ error: (e as Error).message || "Erro no servidor." }, 500);
    }
});
