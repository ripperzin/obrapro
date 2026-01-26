import { useState } from 'react';
import { useProjects } from './useProjects';
import { chatWithData, ChatResponse, ChatMessage } from '../lib/gemini';

interface ProjectBrainHook {
    loading: boolean;
    processMessage: (message: string, history: ChatMessage[], currentProjectId?: string | null) => Promise<ChatResponse>;
}

export const useProjectBrain = (): ProjectBrainHook => {
    const { data: projects = [] } = useProjects();
    const [loading, setLoading] = useState(false);

    const processMessage = async (message: string, history: ChatMessage[], currentProjectId?: string | null): Promise<ChatResponse> => {
        setLoading(true);
        try {
            // CONTEXTO TOTAL: Enviamos um resumo completo de tudo que existe no App
            const context: any = {
                currentDate: new Date().toLocaleDateString('pt-BR'),
                allProjects: projects.map(p => ({
                    id: p.id,
                    name: p.name,
                    progress: p.progress,
                    // 1. Financeiro Detalhado
                    financials: {
                        totalExpenses: p.expenses.reduce((s, e) => s + e.value, 0),
                        budget: p.budget?.totalEstimated || 0,
                        expensesByCategory: p.expenses.reduce((acc: any, exp) => {
                            const macroName = p.budget?.macros?.find(m => m.id === exp.macroId)?.name || "Outros";
                            if (!acc[macroName]) acc[macroName] = { total: 0, items: [] };
                            acc[macroName].total += exp.value;
                            if (acc[macroName].items.length < 10) acc[macroName].items.push(exp.description);
                            return acc;
                        }, {})
                    },
                    // 2. Unidades e Vendas
                    units: p.units.map(u => ({
                        id: u.identifier,
                        status: u.status === 'Sold' ? 'Vendida' : 'Disponível',
                        area: u.area,
                        price: u.saleValue || u.valorEstimadoVenda
                    })),
                    // 3. Diário de Obra (Resumo dos últimos registros)
                    diary: p.diary.slice(-5).map(d => ({
                        date: d.date,
                        content: d.content,
                        author: d.author
                    })),
                    // 4. Documentação (Apenas contagem)
                    documentCount: p.documents.length
                })),
                activeTab: currentProjectId ? 'Detalhes da Obra' : 'Painel Geral',
                instructions: "Responda de forma curta e objetiva. Use os dados financeiros reais acima."
            };

            return await chatWithData(message, history, context);
        } catch (error) {
            console.error("Brain Error:", error);
            return {
                text: "Erro na conexão com a inteligência.",
                action: { type: 'NONE' }
            };
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        processMessage
    };
};
