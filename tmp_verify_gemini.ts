
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local from the workspace
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const apiKey = process.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("ERRO: VITE_GEMINI_API_KEY não encontrada no arquivo .env.local");
    process.exit(1);
}

async function verify() {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Olá, responda apenas 'OK' se estiver funcionando.");
        const response = await result.response;
        console.log("STATUS: FUNCIONANDO");
        console.log("RESPOSTA:", response.text());
    } catch (error: any) {
        console.error("STATUS: ERRO");
        console.error("MENSAGEM:", error.message || error);
        if (error.status === 429) {
            console.error("DETALHE: Limite de cota excedido (Quota Exceeded).");
        } else if (error.status === 401 || error.status === 403) {
            console.error("DETALHE: Chave de API inválida ou sem permissão.");
        }
    }
}

verify();
