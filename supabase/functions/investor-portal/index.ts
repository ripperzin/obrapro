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

        // Plano do DONO da obra (project_members.role='owner'). O portal é
        // público, então a trava de plano (marca ObraPro + seções pagas) tem
        // que ser decidida aqui no servidor — senão bastaria editar a URL para
        // tirar o selo ou ligar as seções do plano pago.
        const { data: ownerRow } = await admin
            .from("project_members")
            .select("profiles!inner(plan)")
            .eq("project_id", projectId)
            .eq("role", "owner")
            .limit(1)
            .maybeSingle();
        const rawPlan = (ownerRow as { profiles?: { plan?: string } } | null)?.profiles?.plan;
        const ownerPlan = rawPlan === "pro" || rawPlan === "business" ? rawPlan : "free";

        // Busca paralela das tabelas-filhas, sempre filtrando por project_id.
        const [unitsRes, evidenceRes, expensesRes, budgetRes, contributionsRes, acquisitionRes, investorsRes, profitSharesRes, itemsRes] = await Promise.all([
            admin.from("units").select("*").eq("project_id", projectId),
            admin.from("stage_evidences").select("*").eq("project_id", projectId),
            admin.from("expenses").select("*").eq("project_id", projectId),
            admin.from("project_budgets").select("*").eq("project_id", projectId).maybeSingle(),
            // Aportes por sócio: valor, data e o investidor (nomes vêm da tabela investors).
            // O `id` é obrigatório: é ele que liga o aporte à parcela do cronograma
            // (aporte_plan.paidContrib) — sem ele o link não sabe o que já foi pago.
            // `description` vira a nota da célula. Anexo NÃO vai: comprovante é do dono.
            admin.from("contributions").select("id, value, date, investor_id, description").eq("project_id", projectId),
            // Aquisição (terreno/custos iniciais): só valor/categoria -> para descontar do lucro.
            admin.from("acquisition_costs").select("value, category, date, paid_from_project").eq("project_id", projectId),
            // Sócios (id + nome) para exibir "aportes por sócio".
            admin.from("investors").select("id, name").eq("project_id", projectId),
            // Participação/aporte por sócio (Acerto de aportes): % + flag "não aporta".
            admin.from("profit_shares").select("id, investor_id, name, percentage, nao_aporta").eq("project_id", projectId),
            // Itens do orçamento (id + nome): o link mostra o gasto por item ao abrir a etapa.
            admin.from("project_items").select("id, name").eq("project_id", projectId),
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

        // ----------------------------------------------------------------------
        // Signed URLs: o portal é anon e NÃO tem mais acesso direto ao Storage.
        // Geramos aqui (service role, ignora RLS) as URLs assinadas de todas as
        // fotos/anexos e devolvemos um mapa { path -> signedUrl }. Paths que já
        // são URL completa (http...) passam direto, sem assinar.
        // ----------------------------------------------------------------------
        const isPath = (v: unknown): v is string =>
            typeof v === "string" && v.length > 0 && !v.startsWith("http");

        const evidences = (evidenceRes.data ?? []) as { photos?: string[] }[];
        const expenseRows = (expensesRes.data ?? []) as {
            attachment_url?: string | null;
            attachments?: string[] | null;
        }[];

        const docPaths = new Set<string>();
        for (const ev of evidences) {
            for (const p of ev.photos ?? []) if (isPath(p)) docPaths.add(p);
        }

        const expensePaths = new Set<string>();
        for (const e of expenseRows) {
            if (isPath(e.attachment_url)) expensePaths.add(e.attachment_url as string);
            for (const p of e.attachments ?? []) if (isPath(p)) expensePaths.add(p);
        }

        const signedUrls: Record<string, string> = {};
        const signInto = async (bucket: string, paths: string[]) => {
            if (paths.length === 0) return;
            const { data: signed } = await admin.storage
                .from(bucket)
                .createSignedUrls(paths, 3600);
            for (const s of signed ?? []) {
                if (s.signedUrl && s.path) signedUrls[s.path] = s.signedUrl;
            }
        };

        // Anexos de despesa ficam em expense-attachments; fotos de etapa em
        // project-documents. Por robustez, tentamos cada conjunto no seu bucket
        // e, para o que sobrar, no outro (paths legados podem estar trocados).
        await signInto("expense-attachments", [...expensePaths]);
        await signInto("project-documents", [...docPaths]);
        const unresolved = [...docPaths, ...expensePaths].filter((p) => !signedUrls[p]);
        if (unresolved.length > 0) {
            await signInto("expense-attachments", unresolved.filter((p) => !signedUrls[p]));
            await signInto("project-documents", unresolved.filter((p) => !signedUrls[p]));
        }

        return json({
            ownerPlan,
            project,
            units: unitsRes.data ?? [],
            stageEvidences: evidenceRes.data ?? [],
            expenses: expensesRes.data ?? [],
            contributions: contributionsRes.data ?? [],
            acquisitionCosts: acquisitionRes.data ?? [],
            investors: investorsRes.data ?? [],
            profitShares: profitSharesRes.data ?? [],
            items: itemsRes.data ?? [],
            budget,
            macros,
            subMacros,
            signedUrls,
        });
    } catch (err) {
        console.error("[investor-portal] Erro:", err);
        return json({ error: `Erro: ${(err as Error).message}` }, 500);
    }
});
