import { supabase } from "../supabaseClient";

export interface ReceiptData {
    date: string | null;
    amount: number | null;
    merchant: string | null;
    category: string | null;
    description: string | null;
    originalText?: string;
}

// --- Utility: Compress image before sending to the server (reduz upload) ---
const compressImage = (base64: string, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            // Scale down if larger than maxWidth
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, width, height);

            // Output as JPEG for smaller size
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
        };
        img.onerror = () => resolve(base64); // Fallback to original on error
        img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    });
};

// --- Utility: Friendly error messages ---
const friendlyError = (error: any): string => {
    const msg = error?.message || String(error);
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('429')) {
        return 'Limite de uso da IA atingido. Verifique o faturamento ou cota da sua API.';
    }
    if (msg.includes('503') || msg.includes('high demand') || msg.includes('overloaded')) {
        return 'Servidor de IA sobrecarregado. Tente novamente em alguns segundos.';
    }
    if (msg.includes('API Key') || msg.includes('API_KEY') || msg.includes('não configurada')) {
        return 'Chave de API inválida ou ausente no servidor.';
    }
    if (msg.includes('SAFETY') || msg.includes('blocked')) {
        return 'A imagem foi bloqueada pelo filtro de segurança. Tente outra foto.';
    }
    if (msg.includes('404') || msg.includes('not found')) {
        return 'Modelo de IA não encontrado. O modelo configurado pode estar indisponível.';
    }
    if (msg.includes('Load failed') || (msg.includes('fetch') && !msg.includes('fetching'))) {
        return 'Falha na conexão com o servidor. Verifique sua internet e tente novamente.';
    }
    // Mensagem do Supabase quando não consegue nem falar com a função do servidor
    // (tipicamente sem sinal). Sem isto vazava em inglês pro usuário na obra.
    if (msg.includes('Failed to send a request') || msg.includes('Edge Function')) {
        return 'Não consegui falar com o servidor de leitura. Se estiver sem sinal, digite os valores e deixe o comprovante pra depois.';
    }
    return `Erro ao analisar: ${msg}`;
};

/**
 * Lê um recibo a partir de uma imagem.
 * A imagem é comprimida no cliente e enviada para a edge function `ocr-receipt`,
 * que chama o Gemini no servidor (a chave de IA nunca é exposta no app).
 */
export const parseReceiptImage = async (imageBase64: string): Promise<ReceiptData> => {
    // Ler o comprovante acontece no SERVIDOR (a chave de IA nunca vai pro app),
    // então sem internet não tem como. Avisamos ANTES de tentar: o erro cru que
    // aparecia era "Failed to send a request to the Edge Function" — em inglês,
    // sem explicação e sem saída (pegou o Victor no teste de modo avião, 18/08).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Sem internet: a leitura automática do comprovante precisa de conexão. Digite os valores e anexe a foto quando o sinal voltar.');
    }
    try {
        const compressed = await compressImage(imageBase64);

        const { data, error } = await supabase.functions.invoke('ocr-receipt', {
            body: { image: compressed },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        return data as ReceiptData;
    } catch (error: any) {
        console.error("OCR Error:", error);
        throw new Error(friendlyError(error));
    }
};
