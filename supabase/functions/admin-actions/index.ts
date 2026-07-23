// Edge Function: admin-actions
// As ações do painel do DONO DO APP que o banco NÃO deixa o navegador fazer:
// trocar plano, dar/retirar cortesia (dias grátis), bloquear/reativar e CRIAR
// cliente (Admin API). Tudo com a service role no servidor.
//
// Trava: o chamador precisa ser admin. Verificamos o JWT dele (getUser) e o
// role no profile ANTES de qualquer ação. Não é o front escondendo botão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLANS = ["free", "pro", "business"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
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

        // Service role: ignora RLS. Usada pra checar o role e pra executar a ação.
        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

        // 2) O chamador é admin (dono do app)?
        const { data: me } = await admin.from("profiles").select("role").eq("id", caller.id).single();
        if (me?.role !== "admin") return json({ error: "Acesso negado: apenas o dono do app." }, 403);

        const { action, ...args } = await req.json().catch(() => ({ action: null }));

        // ---- trocar plano ----------------------------------------------------
        if (action === "set_plan") {
            const { userId, plan } = args;
            if (!UUID_RE.test(userId || "") || !PLANS.includes(plan)) return json({ error: "Dados inválidos." }, 400);
            const { error } = await admin.from("profiles").update({ plan }).eq("id", userId);
            if (error) throw error;
            return json({ ok: true });
        }

        // ---- cortesia (dias grátis de ObraPro) ------------------------------
        // days > 0: soma a partir de hoje (ou estende a cortesia vigente).
        // days = 0 / null: tira a cortesia.
        if (action === "set_trial") {
            const { userId, days } = args;
            if (!UUID_RE.test(userId || "")) return json({ error: "Cliente inválido." }, 400);
            let trial_until: string | null = null;
            if (days && days > 0) {
                const { data: cur } = await admin.from("profiles").select("trial_until").eq("id", userId).single();
                const hoje = new Date();
                const base = cur?.trial_until && new Date(cur.trial_until + "T00:00:00") > hoje
                    ? new Date(cur.trial_until + "T00:00:00") : hoje;
                base.setDate(base.getDate() + Number(days));
                trial_until = base.toISOString().slice(0, 10);
            }
            const { error } = await admin.from("profiles").update({ trial_until }).eq("id", userId);
            if (error) throw error;
            return json({ ok: true, trial_until });
        }

        // ---- bloquear / reativar --------------------------------------------
        if (action === "set_blocked") {
            const { userId, blocked } = args;
            if (!UUID_RE.test(userId || "") || typeof blocked !== "boolean") return json({ error: "Dados inválidos." }, 400);
            if (userId === caller.id) return json({ error: "Você não pode bloquear a si mesmo." }, 400);
            const { error } = await admin.from("profiles").update({ blocked }).eq("id", userId);
            if (error) throw error;
            return json({ ok: true });
        }

        // ---- criar cliente (Admin API) --------------------------------------
        if (action === "create_user") {
            const email = String(args.email || "").trim().toLowerCase();
            const password = String(args.password || "");
            const full_name = String(args.fullName || "").trim();
            const plan = args.plan;
            if (!EMAIL_RE.test(email)) return json({ error: "E-mail inválido." }, 400);
            if (password.length < 6) return json({ error: "A senha precisa de ao menos 6 caracteres." }, 400);
            if (!PLANS.includes(plan)) return json({ error: "Plano inválido." }, 400);

            // email_confirm: já entra valendo (o dono criou; não manda link de confirmação).
            const { data: created, error: cErr } = await admin.auth.admin.createUser({
                email, password, email_confirm: true, user_metadata: { full_name },
            });
            if (cErr) return json({ error: cErr.message }, 400);

            // O gatilho handle_new_user cria o profile (role 'user'); só ajustamos
            // o plano e o nome. NUNCA cria admin por aqui.
            const uid = created.user?.id;
            if (uid) await admin.from("profiles").update({ plan, full_name }).eq("id", uid);
            return json({ ok: true, id: uid });
        }

        return json({ error: "Ação desconhecida." }, 400);
    } catch (e) {
        return json({ error: (e as Error).message || "Erro no servidor." }, 500);
    }
});
