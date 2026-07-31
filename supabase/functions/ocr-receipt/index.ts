// Edge Function: ocr-receipt
// Recebe uma imagem (base64) do app, chama o Gemini no SERVIDOR e devolve os dados do recibo.
// A chave do Gemini fica em Deno.env (segredo do Supabase) e NUNCA é exposta no app.
//
// TRAVA DE PLANO (servidor): OCR é dos planos Completo/Construtora. Sem isso,
// uma conta free chamando a function direto queimava a API do Gemini de graça.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Plano efetivo = base, mas free com cortesia (trial_until futuro) vale ao menos
// 'pro'. Espelho de hooks/useEntitlements.ts effectivePlan (o Deno não lê o front).
const effectivePlanOf = (plan: unknown, trialUntil: unknown): string => {
    const base = plan === "pro" || plan === "business" ? plan : "free";
    if (base !== "free") return base;
    if (typeof trialUntil === "string" && trialUntil) {
        const fim = new Date(trialUntil + "T23:59:59");
        if (!isNaN(fim.getTime()) && fim.getTime() >= Date.now()) return "pro";
    }
    return "free";
};

// Valida o JWT do chamador e checa se o plano dele libera o recurso. Admin sempre
// passa. Devolve a mensagem de erro (pra mostrar ao usuário) ou null se liberado.
const planGateError = async (req: Request, allowed: string[], msg: string): Promise<string | null> => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return "Servidor não configurado.";

    const authHeader = req.headers.get("Authorization") || "";
    const asCaller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await asCaller.auth.getUser();
    if (error || !user) return "Não autenticado.";

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me } = await admin.from("profiles").select("role, plan, trial_until").eq("id", user.id).single();
    if (me?.role === "admin") return null;
    if (allowed.includes(effectivePlanOf(me?.plan, me?.trial_until))) return null;

    // O plano PRÓPRIO não libera. Mas talvez seja FUNCIONÁRIO de uma obra cujo
    // DONO libera — ele usa as features do plano do patrão (espelha o ownerPlan
    // do app). Libera se o caller é membro de ALGUMA obra com dono no plano certo.
    const { data: mem } = await admin.from("project_members").select("project_id").eq("user_id", user.id);
    const projectIds = [...new Set((mem ?? []).map((m: { project_id: string }) => m.project_id))];
    if (projectIds.length) {
        const { data: owners } = await admin.from("project_members").select("user_id").eq("role", "owner").in("project_id", projectIds);
        const ownerIds = [...new Set((owners ?? []).map((o: { user_id: string }) => o.user_id))];
        if (ownerIds.length) {
            const { data: ops } = await admin.from("profiles").select("plan, trial_until").in("id", ownerIds);
            for (const op of (ops ?? []) as { plan: string; trial_until: string | null }[]) {
                if (allowed.includes(effectivePlanOf(op.plan, op.trial_until))) return null;
            }
        }
    }
    return msg;
};

const PROMPT = `
Analyze this receipt image and extract the following data in JSON format:
{
  "total_amount": number,
  "date": "YYYY-MM-DD",
  "merchant_name": string,
  "category_guess": string,
  "description": string
}
ALWAYS respond 'description' and 'category_guess' in Brazilian Portuguese (pt-BR).
Respond ONLY with the JSON, no markdown.
`;

const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash";

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
        // Trava de plano ANTES de tocar na API do Gemini (senão free queima cota).
        const gateErr = await planGateError(req, ["pro", "business"], "O escaneamento de comprovante (OCR) está disponível a partir do plano Completo.");
        if (gateErr) return json({ error: gateErr });

        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return json({ error: "Chave de IA não configurada no servidor." });

        const { image } = await req.json().catch(() => ({ image: null }));
        if (!image || typeof image !== "string") {
            return json({ error: "Imagem ausente ou inválida." });
        }

        // Separar mime type e dados base64
        let data = image;
        let mimeType = "image/jpeg";
        if (image.includes(";base64,")) {
            const parts = image.split(";base64,");
            mimeType = parts[0].split(":")[1] || "image/jpeg";
            data = parts[1];
        }

        const callModel = async (model: string): Promise<string> => {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: PROMPT },
                                { inline_data: { mime_type: mimeType, data } },
                            ],
                        }],
                    }),
                },
            );
            if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
            const body = await res.json();
            return body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        };

        let text: string;
        try {
            text = await callModel(PRIMARY_MODEL);
        } catch (primaryErr) {
            console.warn(`[ocr-receipt] Primário falhou, tentando fallback:`, String(primaryErr));
            text = await callModel(FALLBACK_MODEL);
        }

        const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(clean);

        return json({
            date: parsed.date || null,
            amount: typeof parsed.total_amount === "number"
                ? parsed.total_amount
                : parseFloat(parsed.total_amount) || null,
            merchant: parsed.merchant_name || null,
            category: parsed.category_guess || null,
            description: parsed.description || null,
        });
    } catch (err) {
        console.error("[ocr-receipt] Erro:", err);
        return json({ error: `Erro ao analisar recibo: ${(err as Error).message}` });
    }
});
