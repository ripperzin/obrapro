import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process.env as any).VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (API_KEY && API_KEY !== 'undefined') {
    genAI = new GoogleGenerativeAI(API_KEY);
}

export interface ReceiptData {
    date: string | null;
    amount: number | null;
    merchant: string | null;
    category: string | null;
    description: string | null;
    originalText?: string;
}

export interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
}

export interface ChatResponse {
    text: string;
    action?: {
        type: 'ADD_EXPENSE' | 'NAVIGATE' | 'ADD_DIARY' | 'ADD_UNIT' | 'NONE';
        data?: any;
    };
}

// --- Utility: Compress image before sending to API ---
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

// --- Utility: Retry with exponential backoff ---
const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1500
): Promise<T> => {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const msg = error?.message || '';
            const isRetryable = msg.includes('503') || msg.includes('Load failed') || msg.includes('overloaded') || msg.includes('high demand') || msg.includes('RESOURCE_EXHAUSTED');

            if (!isRetryable || attempt === maxRetries - 1) throw error;

            const delay = baseDelay * Math.pow(2, attempt); // 1.5s, 3s, 6s
            console.warn(`[Gemini] Tentativa ${attempt + 1} falhou (${msg}). Retentando em ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
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
    if (msg.includes('API Key') || msg.includes('API_KEY')) {
        return 'Chave de API inválida ou ausente.';
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
    return `Erro ao analisar: ${msg}`;
};

// Primary and fallback models
const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash";

export const parseReceiptImage = async (imageBase64: string): Promise<ReceiptData> => {
    if (!genAI) {
        throw new Error("Chave de API Gemini não encontrada.");
    }

    const prompt = `
    Analyze this receipt image and extract the following data in JSON format:
    {
      "total_amount": number,
      "date": "YYYY-MM-DD",
      "merchant_name": string,
      "category_guess": string,
      "description": string
    }
    ALWAYS respond 'description' and 'category_guess' in Brazilian Portuguese (pt-BR).
  `;

    try {
        // Step 1: Compress the image
        const compressed = await compressImage(imageBase64);

        let inlineData = compressed;
        let mimeType = "image/jpeg";

        if (compressed.includes("data:") && compressed.includes(";base64,")) {
            const parts = compressed.split(";base64,");
            mimeType = parts[0].split(":")[1];
            inlineData = parts[1];
        }

        const contentPayload = [
            prompt,
            {
                inlineData: {
                    data: inlineData,
                    mimeType: mimeType,
                },
            },
        ];

        // Step 2: Try primary model with retry, then fallback
        const executeWithModel = async (modelName: string) => {
            const model = genAI!.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(contentPayload);
            const response = await result.response;
            return response.text();
        };

        let text: string;
        try {
            text = await retryWithBackoff(() => executeWithModel(PRIMARY_MODEL));
        } catch (primaryError: any) {
            console.warn(`[Gemini] Modelo primário (${PRIMARY_MODEL}) falhou:`, primaryError.message);
            console.log(`[Gemini] Tentando modelo fallback (${FALLBACK_MODEL})...`);
            text = await retryWithBackoff(() => executeWithModel(FALLBACK_MODEL), 2, 2000);
        }

        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(cleanText);

        return {
            date: data.date || null,
            amount: typeof data.total_amount === 'number' ? data.total_amount : parseFloat(data.total_amount) || null,
            merchant: data.merchant_name || null,
            category: data.category_guess || null,
            description: data.description || null
        };
    } catch (error: any) {
        console.error("Gemini OCR Error:", error);
        throw new Error(friendlyError(error));
    }
};

export const chatWithData = async (message: string, history: ChatMessage[], context: any): Promise<ChatResponse> => {
    if (!genAI) {
        return {
            text: "Erro: Chave de API não encontrada.",
            action: { type: 'NONE' }
        };
    }

    try {
        // Atualizado para um modelo mais recente (gemini-2.5-flash) pois o anterior estava indisponível
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash"
        });

        const historyString = history.map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.text}`).join('\n');

        const prompt = `
        Você é o cérebro do ObraPro. Responda APENAS em JSON.
        
        CONTEXTO:
        ${JSON.stringify(context)}

        HISTÓRICO:
        ${historyString}

        USUÁRIO: "${message}"

        JSON SCHEMA:
        { 
          "text": "Sua resposta", 
          "action": { 
             "type": "ADD_EXPENSE" | "NAVIGATE" | "ADD_DIARY" | "ADD_UNIT" | "NONE", 
             "data": { "projectId": "string", "value": number, "description": "string", "identifier": "string", "area": number, "cost": number, "salePrice": number, "tab": "string", "content": "string" }
          } 
        }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

        return JSON.parse(cleanText) as ChatResponse;
    } catch (error: any) {
        console.error("Gemini Error:", error);
        // Retornar o erro real para o usuário ver
        return {
            text: `ERRO TÉCNICO: ${error.message || JSON.stringify(error)}`,
            action: { type: 'NONE' }
        };
    }
};
