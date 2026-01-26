import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const API_KEY = (process.env as any).GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (API_KEY) {
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
        type: 'ADD_EXPENSE' | 'NAVIGATE' | 'ADD_DIARY' | 'NONE';
        data?: any;
    };
}

export const parseReceiptImage = async (imageBase64: string): Promise<ReceiptData> => {
    if (!genAI) {
        throw new Error("Gemini API Key missing. Check .env.local");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
    Analyze this receipt image and extract the following data in JSON format:
    - total_amount: The final total paid (number).
    - date: The date of transaction in YYYY-MM-DD format.
    - merchant_name: Name of the store or establishment.
    - category_guess: Guess the expense category in Portuguese (e.g., 'Alimentação', 'Transporte', 'Materiais', 'Ferramentas', 'Mão de Obra', 'Outros').
    - description: A short description in Portuguese (e.g., 'Almoço no Restaurante', 'Corrida Uber', 'Compra de Cimento').

    Return ONLY the JSON text, no markdown code blocks.
    If a field cannot be determined, return null.
    ALWAYS respond 'description' and 'category_guess' in Brazilian Portuguese (pt-BR).
  `;

    try {
        let inlineData = imageBase64;
        let mimeType = "image/jpeg";

        if (imageBase64.includes("data:") && imageBase64.includes(";base64,")) {
            const parts = imageBase64.split(";base64,");
            mimeType = parts[0].split(":")[1];
            inlineData = parts[1];
        } else {
            const base64Prefix = "base64,";
            const index = imageBase64.indexOf(base64Prefix);
            if (index !== -1) {
                inlineData = imageBase64.substring(index + base64Prefix.length);
            }
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
        console.error("Error parsing receipt with Gemini:", error);
        throw error;
    }
};

export const chatWithData = async (message: string, history: ChatMessage[], context: any): Promise<ChatResponse> => {
    if (!genAI) {
        throw new Error("Gemini API Key missing.");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const contextSummary = JSON.stringify(context, null, 2);

    // Convert history to string for the prompt
    const historyString = history.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.text}`).join('\n');

    const systemPrompt = `
    You are an AI Assistant for a Construction Project Management App ("Obra Pro").
    Your goal is to help the user manage their construction projects, expenses, and budget.

    CURRENT DATA CONTEXT (ALL PROJECTS):
    ${contextSummary}

    CONVERSATION HISTORY:
    ${historyString}

    USER QUERY: "${message}"

    INSTRUCTIONS:
    1. Analyze the USER QUERY based on the DATA CONTEXT and HISTORY.
    2. Respond naturally in Portuguese (Brazil).
    3. If the user asks to perform an action (like "Add expense", "Go to expenses"), include an 'action' field in your JSON response.
    4. If the user asks for analysis (e.g., "How much spent in work X?"), check the data context for that specific project name.
    
    BUSINESS LOGIC (IMPORTANT):
    - When the user asks about "Margem", always refer to the value calculates as ROI/Markup in the app (Profit/Cost).
    - Do NOT suggest "Margem Bruta" (Profit/Revenue) as the primary metric unless explicitly asked about technical accounting differences.
    - Treat ROI as the main success metric for the investor.
    
    RESPONSE FORMAT    ACTION DETAILS:
    - ADD_EXPENSE: If user says "Add expense of 50 reais for cement". Data: { description: "Cement", value: 50 }
    - NAVIGATE: If user says "Go to dashboard". Data: { tab: "general" | "projects" | "users" | "audit", projectId?: "projectId" }
    - ADD_DIARY: If user says "Add diary entry: raining today". Data: { content: "Raining today" }
    - ADD_UNIT: If user says "Add a new unit". Data: { identifier: "House 01" }

    IMPORTANT:
    - BE HELPFUL and INSIGHTFUL.
    - If specific project data is missing, ask for clarification.
    - RETURN ONLY JSON.
    `;

    try {
        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

        try {
            return JSON.parse(cleanText) as ChatResponse;
        } catch (e) {
            return {
                text: text,
                action: { type: 'NONE' }
            };
        }
    } catch (error) {
        console.error("Gemini Chat Error:", error);
        return {
            text: "Erro ao processar. Tente novamente.",
            action: { type: 'NONE' }
        };
    }
};
