import Anthropic from '@anthropic-ai/sdk';

const API_KEY = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY || (process.env as any).VITE_ANTHROPIC_API_KEY;

let anthropic: Anthropic | null = null;

// DIAGNÓSTICO DE CHAVE API (Vercel)
console.log('🔑 DIAGNÓSTICO CLAUDE:', {
    VITE_ANTHROPIC_API_KEY_EXISTS: !!(import.meta as any).env?.VITE_ANTHROPIC_API_KEY,
    PROCESS_ENV_EXISTS: !!(process.env as any).VITE_ANTHROPIC_API_KEY,
    API_KEY_LENGTH: API_KEY ? API_KEY.length : 0,
    API_KEY_PREFIX: API_KEY ? API_KEY.substring(0, 7) + '...' : 'N/A'
});

if (API_KEY) {
    anthropic = new Anthropic({
        apiKey: API_KEY,
        dangerouslyAllowBrowser: true
    });
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    text: string;
    action?: {
        type: 'NONE' | 'ADD_DIARY' | 'ADD_EXPENSE' | 'ADD_UNIT';
        data?: any;
    };
}

const SYSTEM_PROMPT = `Você é o Copiloto ObraPro - um assistente inteligente para gestão de obras.

==================================================
REGRAS BÁSICAS
==================================================

1. Use APENAS os dados do contexto. NUNCA invente valores.
2. Se "dadosFiltrados" existir, é sua ÚNICA fonte de verdade.
3. Formate valores em R$ com separador de milhar.
4. Se dados estiverem vazios/null, diga "Não há dados".

==================================================
MULTI_OBRA (escopoConfirmado = "MULTI_OBRA")
==================================================

Quando escopoConfirmado === "MULTI_OBRA", você DEVE:

✅ RESPONDER DIRETAMENTE perguntas como:
   - "qual obra está pior" → Identifique a obra com mais alertas/problemas
   - "qual a melhor" → Identifique a com maior ROI ou mais vendas
   - "compare as obras" → Liste com ranking

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

EXEMPLO - "qual obra está pior":
"A obra com mais problemas é **OBRA 34**:
⚠️ Orçamento crítico: 95%
📊 Progresso: 30%

Seguida por OBRA 42 POLI com alerta de prazo."

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
  "text": "sua resposta aqui",
  "action": { "type": "NONE", "data": null }
}
`;

export const chatWithClaude = async (message: string, history: ChatMessage[], context: any): Promise<ChatResponse> => {
    if (!anthropic) {
        return { text: "Erro: Chave de API não configurada.", action: { type: 'NONE' } };
    }

    try {
        const contextPrompt = `${SYSTEM_PROMPT}

==================================================
CONTEXTO (dados do sistema)
==================================================
${JSON.stringify(context, null, 2)}

MENSAGEM DO USUÁRIO: "${message}"

Responda em JSON. Seja DIRETO e OBJETIVO.`;

        const modelsToTry = ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"];
        let msg: Anthropic.Message | null = null;

        for (const model of modelsToTry) {
            try {
                console.log(`🤖 Tentando: ${model}`);
                msg = await anthropic.messages.create({
                    model,
                    max_tokens: 1024,
                    system: contextPrompt,
                    messages: [{ role: 'user', content: message }] as any,
                    temperature: 0.3,
                });
                console.log(`✅ Sucesso: ${model}`);
                break;
            } catch (error: any) {
                console.warn(`❌ Falha: ${model}`, error.status || error.message);
            }
        }

        if (!msg) throw new Error("Nenhum modelo disponível");

        const textBlock = msg.content[0];
        let textContent = textBlock.type === 'text' ? textBlock.text : '';

        try {
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return { text: parsed.text || textContent, action: parsed.action || { type: 'NONE' } };
            }
        } catch { }

        return { text: textContent, action: { type: 'NONE' } };

    } catch (error: any) {
        console.error("Claude Error:", error);
        return { text: `Erro: ${error.message}`, action: { type: 'NONE' } };
    }
};
