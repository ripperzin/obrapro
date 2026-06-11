// Edge Function: ocr-receipt
// Recebe uma imagem (base64) do app, chama o Gemini no SERVIDOR e devolve os dados do recibo.
// A chave do Gemini fica em Deno.env (segredo do Supabase) e NUNCA é exposta no app.
import { meterAI } from "../_shared/ai-metering.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        const apiKey = Deno.env.get("GEMINI_API_KEY");
        if (!apiKey) return json({ error: "Chave de IA não configurada no servidor." });

        const { image } = await req.json().catch(() => ({ image: null }));
        if (!image || typeof image !== "string") {
            return json({ error: "Imagem ausente ou inválida." });
        }

        // Limite de IA por usuário/mês (protege custo + base da monetização).
        const gate = await meterAI(req, "ocr");
        if (!gate.allowed) return json({ error: gate.reason, limitReached: true });

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
