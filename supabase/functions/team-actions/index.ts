// Edge Function: team-actions
// As ações da EQUIPE que o banco NÃO deixa o navegador fazer:
//  - create_member: criar o login do funcionário (Admin API) e prendê-lo a uma obra
//  - set_member_password: o Dono reseta a senha de um funcionário dele
//  - list_team: listar "minha equipe" (o Dono não enxerga o perfil dos outros por RLS)
//
// Adicionar/tirar/trocar o cargo de um membro numa obra é feito direto pelo
// navegador — a regra members_insert/delete já só deixa o DONO da obra fazer isso.
//
// Trava: o chamador precisa ser o DONO da obra em questão (project_members.role='owner')
// OU o dono do app (profiles.role='admin'). Verificamos o JWT dele e a titularidade
// ANTES de qualquer ação. Não é o front escondendo botão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CARGOS = ["gestor", "apontador"]; // o 'owner' nasce com a obra; não se cria por aqui
const LOGIN_RE = /^[a-zA-Z0-9._-]{3,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Servidor não configurado." }, 500);

        // 1) Quem está chamando? Valida o JWT do próprio requisitante.
        const authHeader = req.headers.get("Authorization") || "";
        const asCaller = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user: caller }, error: callerErr } = await asCaller.auth.getUser();
        if (callerErr || !caller) return json({ error: "Não autenticado." }, 401);

        // Service role: ignora RLS. Usada pra checar titularidade e executar a ação.
        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

        const { data: me } = await admin.from("profiles").select("role, plan").eq("id", caller.id).single();
        const isAdmin = me?.role === "admin";
        const callerPlan = me?.plan;

        // O chamador é o DONO desta obra (ou o dono do app)?
        const ownsProject = async (projectId: string): Promise<boolean> => {
            if (isAdmin) return true;
            const { data } = await admin.from("project_members")
                .select("user_id").eq("project_id", projectId).eq("user_id", caller.id).eq("role", "owner").maybeSingle();
            return !!data;
        };
        // O funcionário-alvo é da MINHA equipe (eu criei)?
        const isMyMember = async (userId: string): Promise<boolean> => {
            if (isAdmin) return true;
            const { data } = await admin.from("profiles").select("created_by").eq("id", userId).maybeSingle();
            return data?.created_by === caller.id;
        };

        const { action, ...args } = await req.json().catch(() => ({ action: null }));

        // ---- listar minha equipe --------------------------------------------
        // Funcionários que EU criei + em quais das minhas obras cada um está.
        if (action === "list_team") {
            const { data: team } = await admin.from("profiles")
                .select("id, login, full_name")
                .eq("created_by", caller.id)
                .order("full_name", { ascending: true });
            const ids = (team || []).map((t) => t.id);
            let memberships: Record<string, Record<string, string>> = {};
            if (ids.length) {
                const { data: mem } = await admin.from("project_members")
                    .select("project_id, user_id, role").in("user_id", ids);
                for (const m of mem || []) {
                    (memberships[m.user_id] ||= {})[m.project_id] = m.role;
                }
            }
            const out = (team || []).map((t) => ({
                id: t.id, login: t.login, fullName: t.full_name || "",
                memberships: memberships[t.id] || {},
            }));
            return json({ ok: true, team: out });
        }

        // ---- criar o login do funcionário (Admin API) ------------------------
        // Cria só a CONTA (login/senha). As obras e os cargos o Dono distribui
        // depois, no card da equipe (seletor por obra). Equipe é do Construtora.
        if (action === "create_member") {
            const login = String(args.login || "").trim();
            const password = String(args.password || "");
            const full_name = String(args.fullName || "").trim();
            if (!LOGIN_RE.test(login)) return json({ error: "Login inválido (letras, números, ponto, hífen ou _; mín. 3)." }, 400);
            if (password.length < 6) return json({ error: "A senha precisa de ao menos 6 caracteres." }, 400);
            // Trava de plano no servidor: equipe é do Construtora (não só o front esconde).
            if (!isAdmin && callerPlan !== "business") return json({ error: "A equipe faz parte do plano Construtora." }, 403);

            // Login é único (case-insensitive) — checa antes de criar a conta.
            const { data: jaExiste } = await admin.from("profiles").select("id").ilike("login", login).maybeSingle();
            if (jaExiste) return json({ error: "Esse login já está em uso. Escolha outro." }, 400);

            // O funcionário loga só pelo apelido; geramos um e-mail interno (ele nunca vê).
            const email = `${login.toLowerCase()}@equipe.obrapro.app`;
            const { data: created, error: cErr } = await admin.auth.admin.createUser({
                email, password, email_confirm: true, user_metadata: { full_name },
            });
            if (cErr) return json({ error: cErr.message }, 400);

            const uid = created.user?.id;
            if (!uid) return json({ error: "Falha ao criar a conta." }, 500);

            // O gatilho handle_new_user cria o profile (role 'user'); ajustamos nome,
            // login, deixamos plano 'free' (o funcionário usa o plano do DONO da obra)
            // e marcamos quem o criou (a espinha do "minha equipe").
            const { error: uErr } = await admin.from("profiles")
                .update({ full_name, login, plan: "free", created_by: caller.id }).eq("id", uid);
            if (uErr && (uErr as { code?: string }).code === "23505") {
                await admin.auth.admin.deleteUser(uid);
                return json({ error: "Esse login já está em uso. Escolha outro." }, 400);
            }
            if (uErr) { await admin.auth.admin.deleteUser(uid); return json({ error: uErr.message }, 400); }

            return json({ ok: true, id: uid });
        }

        // ---- o Dono reseta a senha de um funcionário dele --------------------
        if (action === "set_member_password") {
            const userId = String(args.userId || "");
            const password = String(args.password || "");
            if (!UUID_RE.test(userId)) return json({ error: "Funcionário inválido." }, 400);
            if (password.length < 6) return json({ error: "A senha precisa de ao menos 6 caracteres." }, 400);
            if (!(await isMyMember(userId))) return json({ error: "Esse funcionário não é da sua equipe." }, 403);
            const { error } = await admin.auth.admin.updateUserById(userId, { password });
            if (error) throw error;
            return json({ ok: true });
        }

        return json({ error: "Ação desconhecida." }, 400);
    } catch (e) {
        return json({ error: (e as Error).message || "Erro no servidor." }, 500);
    }
});
