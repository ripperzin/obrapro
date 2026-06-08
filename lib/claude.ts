import { supabase } from '../supabaseClient';

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

/**
 * Conversa com o Claude através da edge function `ai-copilot`.
 * A chave Anthropic fica no servidor (Deno.env) e nunca é exposta no app.
 * O parâmetro `history` é mantido por compatibilidade (o contexto já é montado no chamador).
 */
export const chatWithClaude = async (
    message: string,
    _history: ChatMessage[],
    context: any
): Promise<ChatResponse> => {
    try {
        const { data, error } = await supabase.functions.invoke('ai-copilot', {
            body: { message, context },
        });

        if (error) throw error;
        if (data?.error) return { text: `Erro: ${data.error}`, action: { type: 'NONE' } };

        return { text: data.text, action: data.action || { type: 'NONE' } };
    } catch (error: any) {
        console.error("Claude Error:", error);
        return { text: `Erro: ${error.message}`, action: { type: 'NONE' } };
    }
};
