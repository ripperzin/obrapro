// Edge Function: ai-copilot
// Recebe {message, context} do app, chama o Claude no SERVIDOR e devolve {text, action}.
// A chave Anthropic fica em Deno.env (segredo do Supabase) e NUNCA é exposta no app.
//
// TRAVA DE PLANO (servidor): o Copiloto é do plano Construtora. Sem isso, uma
// conta free chamando a function direto queimava a API da Anthropic de graça.
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";
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
    return msg;
};

const SYSTEM_PROMPT = `Você é o Copiloto ObraPro - um assistente inteligente para gestão de obras.

==================================================
REGRAS BÁSICAS
==================================================

1. Use APENAS os dados do contexto. NUNCA invente valores.
2. Se "dadosFiltrados" existir, é sua ÚNICA fonte de verdade.
3. Formate valores em R$ com separador de milhar.
4. Se dados estiverem vazios/null, diga "Não há dados".

==================================================
FORMATAÇÃO VISUAL (OBRIGATÓRIO)
==================================================

Você deve alternar entre dois estilos conforme o conteúdo:

ESTILO 1: DADOS E RELATÓRIOS (Use Listas Verticais e Ícones)
Sempre que apresentar números, listas, despesas ou status:
- NUNCA use texto corrido para dados.
- Use UMA informação por linha.
- Use emojis como "bullets".
- Negrite os valores chaves.

Exemplo BOM:
📊 **Resumo da Obra**
🏗️ **Etapa:** Fundação
💰 **Gasto Total:** **R$ 45.000,00**
📉 **Progresso:** 10%

Detalhamento:
• 🧱 Cimento: R$ 5.000,00
• 🔩 Aço: R$ 10.000,00

Exemplo RUIM (Proibido):
"A obra está na fundação e gastou R$ 45.000,00 sendo 5 mil de cimento..."

==================================================
ESTRUTURA DE RESPOSTA (OBRIGATÓRIO)
==================================================

Você deve SEMPRE seguir esta ordem em QUALQUER resposta:

1. **RESPOSTA DIRETA**: Responda o que foi perguntado de forma clara e objetiva.
2. **DIVISOR**: Use uma linha horizontal (---).
3. **RESUMO DE STATUS**: Apresente SEMPRE o seguinte quadro ao final:

📊 **Resumo da Obra:**
🏗️ **Etapa:** [Nome da Etapa]
📈 **Progresso:** [X]% ([X] dias de obra)
💰 **Gasto:** R$ [Valor] ([X]% do total orçado)

Use os dados de "resumoPadronizado" ou "dadosFiltrados" do contexto.
NUNCA omita este quadro, mesmo que a pergunta seja simples.

ESTILO 2: ANÁLISE E CONSELHOS (Texto Natural)
Para alertas, conselhos ou explicações qualitativas, use texto corrido, mas mantenha **curto e direto**.
Ex: "⚠️ **Atenção:** A etapa de fundação estourou o orçamento. Recomendo rever os custos de aço para as próximas fases."

==================================================
MULTI_OBRA (escopoConfirmado = "MULTI_OBRA")
==================================================

Quando escopoConfirmado === "MULTI_OBRA", você DEVE:

✅ RESPONDER DIRETAMENTE perguntas como:
   - "qual obra está pior" → Identifique a obra com mais alertas/problemas
   - "qual a melhor" → Identifique a com maior ROI ou mais vendas
   - "compare as obras" → Liste com ranking
   - "total de unidades", "quanto vendi no total" → Use o campo **"resumoGlobal"** do contexto.

✅ CRITÉRIOS PARA "PIOR":
   1. Obra com mais alertas (⚠️ 🚨)
   2. Orçamento estourado (>100%)
   3. Atrasada (dias negativos)
   4. Menor progresso

✅ CRITÉRIOS PARA "MELHOR":
   1. Maior ROI
   2. 100% de progresso
   3. Mais vendas
   4. Sem alertas

✅ USO DO "resumoGlobal":
Use os campos para somatórios globais.
- **Concluídas** (Obras 100%): use 'unidadesConcluidas' e 'valorUnidadesConcluidas'.
- **Em Construção** (Obras < 100%): use 'unidadesEmConstrucao', 'unidadesVendidasEmConstrucao', 'unidadesDisponiveisEmConstrucao', 'valorVendasEmConstrucao' (o que já foi vendido nelas) e 'valorEstoqueEmConstrucao' (o que tem a vender nelas ainda).
- **Geral**: 'unidadesTotais', 'unidadesVendidas', 'valorTotalVendasRealizadas'.

==================================================
SINGULAR (escopoConfirmado = "SINGULAR")
==================================================

Quando uma obra específica é mencionada:
- Responda sobre APENAS essa obra
- Use os dados de "dadosFiltrados"
- Se perguntar sobre insumo, filtre por ele

==================================================
AÇÕES
==================================================

- ADD_DIARY: anotar no diário
- ADD_EXPENSE: criar despesa
- ADD_UNIT: cadastrar unidade

==================================================
FORMATO DE RESPOSTA (JSON)
==================================================

{
  "text": "sua resposta aqui formatada com quebras de linha",
  "action": { "type": "NONE", "data": null }
}
`;

const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5"];

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
        // Trava de plano ANTES de tocar na API da Anthropic (senão free queima cota).
        const gateErr = await planGateError(req, ["business"], "O Copiloto de IA está disponível no plano Construtora.");
        if (gateErr) return json({ error: gateErr });

        const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!apiKey) return json({ error: "Chave de IA não configurada no servidor." });

        const { message, context } = await req.json().catch(() => ({ message: null, context: null }));
        if (!message || typeof message !== "string") {
            return json({ error: "Mensagem ausente ou inválida." });
        }

        const anthropic = new Anthropic({ apiKey });

        const systemPrompt = `${SYSTEM_PROMPT}

==================================================
CONTEXTO (dados do sistema)
==================================================
${JSON.stringify(context ?? {}, null, 2)}

Responda em JSON. Seja DIRETO e OBJETIVO.`;

        let msg: any = null;
        for (const model of MODELS) {
            try {
                msg = await anthropic.messages.create({
                    model,
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages: [{ role: "user", content: message }],
                    temperature: 0.3,
                });
                break;
            } catch (err) {
                console.warn(`[ai-copilot] Modelo ${model} falhou:`, String(err));
            }
        }

        if (!msg) return json({ error: "Nenhum modelo de IA disponível." });

        const block = msg.content[0];
        const textContent = block?.type === "text" ? block.text : "";

        // Tentar extrair JSON da resposta
        try {
            const match = textContent.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return json({ text: parsed.text || textContent, action: parsed.action || { type: "NONE" } });
            }
        } catch { /* fallthrough */ }

        return json({ text: textContent, action: { type: "NONE" } });
    } catch (err) {
        console.error("[ai-copilot] Erro:", err);
        return json({ error: `Erro: ${(err as Error).message}` });
    }
});
