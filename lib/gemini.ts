import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const API_KEY = import.meta.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;

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



export const parseReceiptImage = async (imageBase64: string): Promise<ReceiptData> => {
    if (!genAI) {
        throw new Error("Gemini API Key missing. Check .env.local");
    }

    // Using valid alias from user list
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
        // Determine mime type (assuming jpeg/png from typical camera capture, but should ideally check)
        // For simplicity, we assume the base64 string might already contain the data prefix "data:image/x;base64,"
        // If it does, we strip it.

        let inlineData = imageBase64;
        let mimeType = "image/jpeg"; // default fallback

        // Extract mimeType and raw base64 if data URI scheme is present
        if (imageBase64.includes("data:") && imageBase64.includes(";base64,")) {
            const parts = imageBase64.split(";base64,");
            mimeType = parts[0].split(":")[1];
            inlineData = parts[1];
        } else {
            // Legacy/Fallback handling
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

        // Clean up response if it has markdown blocks
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
