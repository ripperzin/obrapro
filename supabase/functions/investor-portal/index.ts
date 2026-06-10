// Edge Function: investor-portal
// Serve o Portal do Investidor (link público #/investor/:id) de forma SEGURA.
//
// Antes, o app lia projects/units/expenses/budgets direto com a chave anônima,
// o que exigia policies `anon using(true)` -> vazava o banco inteiro.
//
// Agora: esta function recebe { projectId } e devolve SOMENTE os dados daquela
// obra, usando a SERVICE ROLE no servidor (que ignora RLS). Nenhuma outra obra
// é acessível, e o role `anon` não tem mais acesso direto às tabelas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceKey) {
            return json({ error: "Servidor não configurado." }, 500);
        }

        const { projectId } = await req.json().catch(() => ({ projectId: null }));
        if (!projectId || typeof projectId !== "string" || !UUID_RE.test(projectId)) {
            return json({ error: "ID de projeto inválido." }, 400);
        }

        // Service role: ignora RLS, então restringimos manualmente a 1 obra.
        const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: project, error: projErr } = await admin
            .from("projects")
            .select("*")
            .eq("id", projectId)
            .maybeSingle();

        if (projErr) throw projErr;
        if (!project) return json({ error: "Projeto não encontrado." }, 404);

        // Busca paralela das tabelas-filhas, sempre filtrando por project_id.
        const [unitsRes, evidenceRes, expensesRes, budgetRes] = await Promise.all([
            admin.from("units").select("*").eq("project_id", projectId),
            admin.from("stage_evidences").select("*").eq("project_id", projectId),
            admin.from("expenses").select("*").eq("project_id", projectId),
            admin.from("project_budgets").select("*").eq("project_id", projectId).maybeSingle(),
        ]);

        const budget = budgetRes.data ?? null;
        let macros: unknown[] = [];
        let subMacros: unknown[] = [];

        if (budget) {
            const { data: macrosData } = await admin
                .from("project_macros")
                .select("*")
                .eq("budget_id", (budget as { id: string }).id)
                .order("display_order");
            macros = macrosData ?? [];

            const macroIds = (macros as { id: string }[]).map((m) => m.id);
            if (macroIds.length > 0) {
                const { data: subsData } = await admin
                    .from("project_sub_macros")
                    .select("*")
                    .in("project_macro_id", macroIds)
                    .order("display_order");
                subMacros = subsData ?? [];
            }
        }

        return json({
            project,
            units: unitsRes.data ?? [],
            stageEvidences: evidenceRes.data ?? [],
            expenses: expensesRes.data ?? [],
            budget,
            macros,
            subMacros,
        });
    } catch (err) {
        console.error("[investor-portal] Erro:", err);
        return json({ error: `Erro: ${(err as Error).message}` }, 500);
    }
});
