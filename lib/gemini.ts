import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process.env as any).VITE_GEMINI_API_KEY || (process.env as any).GEMINI_API_KEY;

if (API_KEY) {
    console.log("Gemini API Key detected. Length:", API_KEY.length);
}

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

export const parseReceiptImage = async (imageBase64: string): Promise<ReceiptData> => {
    if (!genAI) {
        throw new Error("Gemini API Key missing.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

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
        let inlineData = imageBase64;
        let mimeType = "image/jpeg";

        if (imageBase64.includes("data:") && imageBase64.includes(";base64,")) {
            const parts = imageBase64.split(";base64,");
            mimeType = parts[0].split(":")[1];
            inlineData = parts[1];
        }

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: inlineData,
                    mimeType: mimeType,
                },
            },
        ]);

        const response = await result.response;
        const text = response.text();
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const data = JSON.parse(cleanText);

        return {
            date: data.date || null,
            amount: typeof data.total_amount === 'number' ? data.total_amount : parseFloat(data.total_amount) || null,
            merchant: data.merchant_name || null,
            category: data.category_guess || null,
            description: data.description || null
        };
    } catch (error) {
        console.error("Gemini OCR Error:", error);
        throw error;
    }
};

export const chatWithData = async (message: string, history: ChatMessage[], context: any): Promise<ChatResponse> => {
    if (!genAI) {
        return {
            text: "Erro: Chave de API não encontrada (VITE_GEMINI_API_KEY).",
            action: { type: 'NONE' }
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const contextSummary = JSON.stringify(context, null, 2);
        const historyString = history.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`).join('\n');

        const systemPrompt = `
        You are an AI Assistant for "Obra Pro". Help manage construction projects.
        Respond in Portuguese (Brazil). Return ONLY JSON.
        PRECISION: Never mix data between different projects. Check IDs carefully.
        If a user mentions a project ID or name, only use data from that specific project.
        Current selected project is identified by "activeProjectId" in the context.
        
        DATA CONTEXT:
        ${contextSummary}
        HISTORY:
        ${historyString}
        USER QUERY: "${message}"

        Return JSON: { "text": string, "action": { "type": "ADD_EXPENSE" | "NAVIGATE" | "ADD_DIARY" | "ADD_UNIT" | "NONE", "data"?: any } }
        `;

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

        return JSON.parse(cleanText) as ChatResponse;
    } catch (error: any) {
        console.error("Gemini Chat Error:", error);
        return {
            text: `Erro na IA: ${error.message || "404"}. Verifique sua chave de API ou se o modelo está liberado para você.`,
            action: { type: 'NONE' }
        };
    }
};
