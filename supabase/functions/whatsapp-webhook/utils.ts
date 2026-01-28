
// ==========================================
// TIPOS (Portados de types.ts)
// ==========================================

export interface Expense {
    id: string;
    description: string;
    value: number;
    date: string;
    userId: string;
    userName: string;
    macroId?: string;
    subMacroId?: string;
}

export interface Unit {
    id: string;
    identifier: string;
    area: number;
    cost: number;
    status: 'Available' | 'Sold';
    saleValue?: number;
    saleDate?: string;
    valorEstimadoVenda?: number;
}

export interface ProjectBudget {
    totalEstimated: number;
    macros?: any[];
}

export interface DiaryEntry {
    id: string;
    date: string;
    content: string;
    author: string;
}

export interface Project {
    id: string;
    name: string;
    startDate?: string;
    deliveryDate?: string;
    progress: number;
    units: Unit[];
    expenses: Expense[];
    diary: DiaryEntry[];
    budget?: ProjectBudget;
    expectedTotalCost: number;
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

// ==========================================
// CONSTANTES
// ==========================================

export const STAGE_NAMES: Record<number, string> = {
    0: 'Planejamento', 10: 'Fundação', 20: 'Estrutura', 30: 'Alvenaria',
    40: 'Cobertura', 50: 'Instalações', 60: 'Revestimentos', 70: 'Esquadrias',
    80: 'Acabamentos', 90: 'Finalização', 100: 'Concluída'
};

const KEYWORDS = {
    DESPESAS_GERAL: ['gasto', 'gastei', 'despesa', 'custo total', 'total gasto'],
    DESPESAS_INSUMO: [
        'cimento', 'areia', 'brita', 'ferro', 'aço', 'aco', 'tijolo', 'bloco',
        'madeira', 'telha', 'piso', 'azulejo', 'tinta', 'argamassa',
        'eletrica', 'hidraulica', 'encanamento', 'fio', 'cabo', 'cano',
        'mao de obra', 'pedreiro', 'eletricista', 'pintor', 'acabamento',
        'porcelanato', 'gesso', 'drywall', 'vidro', 'esquadria', 'porta', 'janela', 'concreto'
    ],
    ORCAMENTO: ['orcamento', 'budget', 'verba', 'previsao', 'estimado', 'previsto'],
    MARGEM: ['margem', 'lucro', 'rentabilidade', 'retorno', 'ganho', 'roi'],
    PROGRESSO: ['progresso', 'andamento', 'status', 'como esta', 'situacao'],
    ETAPAS: ['etapa', 'fase', 'fundacao', 'estrutura', 'alvenaria', 'cobertura', 'revestimento'],
    DIARIO: ['diario', 'anotacoes', 'registros', 'aconteceu', 'anotado'],
    CRONOGRAMA: ['prazo', 'entrega', 'atraso', 'quando', 'data', 'previsao', 'termino', 'tempo'],
    UNIDADES: ['unidades', 'casas', 'apartamentos', 'aptos', 'unidade'],
    VENDAS: ['vendidas', 'vendas', 'faturamento', 'receita'],
    DISPONIVEIS: ['disponiveis', 'a venda', 'estoque'],
    DOCUMENTOS: ['documentos', 'arquivos', 'contratos', 'plantas'],
    ALERTAS: ['risco', 'atencao', 'alerta', 'preocupar', 'problema', 'critico'],
    // Plural/Panorama (MULTI_OBRA)
    MULTI_OBRA: [
        'obras', 'todas', 'panorama', 'todas as obras', 'minhas obras', 'meus projetos',
        'resumo geral', 'visao geral', 'todas obras', 'projetos', 'tudo',
        'como estao', 'como estão', 'como estao as obras', 'status de todas',
        'todas minhas', 'geral de todas', 'resumo de todas', 'no total', 'no geral', 'soma', 'consolidado',
        'concluidas', 'finalizadas', 'prontas', 'entregues', 'em construcao', 'em construção', 'andamento'
    ],
    PANORAMA: ['resumo', 'visao', 'status geral', 'geral', 'panorama geral'],
    // Comparações
    COMPARACAO: [
        'qual obra esta pior', 'qual obra está pior', 'qual esta pior', 'qual está pior',
        'qual obra esta melhor', 'qual obra está melhor', 'qual esta melhor', 'qual está melhor',
        'qual melhor', 'qual pior', 'compare', 'comparar', 'comparando',
        'ranking', 'rankear', 'ordenar', 'ordenadas', 'melhores', 'piores',
        'mais atrasada', 'menos atrasada',
        'mais cara', 'mais barata', 'gastou mais', 'gastou menos', 'maior gasto', 'menor gasto',
        'qual obra gastou', 'maior custo', 'menor custo', 'mais despesas', 'menos despesas',
        'maior margem', 'menor margem', 'maior roi', 'menor roi',
        'mais vendas', 'menos vendas', 'mais vendida', 'menos vendida',
        'mais unidades', 'menos unidades', 'mais avancada', 'mais avançada'
    ],
    // Ações
    ADD_DIARY: ['anota', 'registra', 'escreve no diario', 'diario:', 'anotacao:'],
    ADD_EXPENSE: ['adiciona despesa', 'nova despesa', 'gasto de', 'paguei', 'comprei'],
    ADD_UNIT: ['adiciona unidade', 'nova casa', 'novo apto', 'cadastra unidade', 'nova unidade'],
};

export const SYSTEM_PROMPT = `Você é o Copiloto ObraPro (Versão WhatsApp) - um assistente inteligente para gestão de obras.
Use APENAS os dados do contexto. NUNCA invente valores.
Se "dadosFiltrados" existir, é sua ÚNICA fonte de verdade.
Formate valores em R$ com separador de milhar.
Seja direto e conciso, apropriado para WhatsApp.
Use emojis para facilitar a leitura.
Se for ACTION, retorne o JSON de ação adequado.`;

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

export function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function calculateMonthsBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
}

export function calcularDuracao(project: Project): { dataInicio: string | null, diasCorridos: number, origem: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (project.startDate) {
        const start = new Date(project.startDate);
        const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return { dataInicio: project.startDate, diasCorridos: Math.max(0, diff), origem: 'Data Oficial' };
    }

    if (project.expenses && project.expenses.length > 0) {
        const dates = project.expenses.map(e => new Date(e.date).getTime()).filter(d => !isNaN(d));
        if (dates.length > 0) {
            const minDate = Math.min(...dates);
            const start = new Date(minDate);
            const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            return {
                dataInicio: new Date(minDate).toISOString().split('T')[0],
                diasCorridos: Math.max(0, diff),
                origem: 'Primeira Despesa'
            };
        }
    }

    return { dataInicio: null, diasCorridos: 0, origem: 'Não definida' };
}

export function verificarAlertas(project: Project): string[] {
    const alertas: string[] = [];
    const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;
    const gasto = project.expenses.reduce((s, e) => s + e.value, 0);
    const percentualGasto = orcamento > 0 ? (gasto / orcamento) * 100 : 0;

    if (percentualGasto > 100) alertas.push(`⚠️ ESTOURADO: ${percentualGasto.toFixed(0)}%`);
    else if (percentualGasto > 90) alertas.push(`⚡ Crítico: ${percentualGasto.toFixed(0)}%`);

    if (project.deliveryDate) {
        const diasRestantes = Math.ceil((new Date(project.deliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diasRestantes < 0) alertas.push(`🚨 ATRASO: ${Math.abs(diasRestantes)}d`);
        else if (diasRestantes < 30 && project.progress < 80) alertas.push(`⏰ Risco: ${diasRestantes}d`);
    }

    return alertas;
}

export function calcularCamposCanonicos(project: Project) {
    const isCompleted = project.progress === 100;
    const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);
    const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);
    const firstExpenseDate = project.expenses.length > 0
        ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date)
        : null;

    let totalRoi = 0;
    let totalMonthlyRoi = 0;
    let soldUnitsCount = 0;

    project.units.forEach(unit => {
        if (unit.status === 'Sold' && unit.saleValue) {
            const realCost = (isCompleted && totalUnitsArea > 0)
                ? (unit.area / totalUnitsArea) * totalExpenses
                : unit.cost;
            const costBase = realCost > 0 ? realCost : unit.cost;

            if (costBase > 0) {
                const roi = (unit.saleValue - costBase) / costBase;
                const months = (unit.saleDate && firstExpenseDate)
                    ? calculateMonthsBetween(firstExpenseDate, unit.saleDate)
                    : null;
                const roiMensal = (months !== null && months > 0) ? roi / months : 0;

                totalRoi += roi;
                totalMonthlyRoi += roiMensal;
                soldUnitsCount++;
            }
        }
    });

    return {
        roi: soldUnitsCount > 0 ? (totalRoi / soldUnitsCount) * 100 : null,
        roiMensal: soldUnitsCount > 0 ? (totalMonthlyRoi / soldUnitsCount) * 100 : null,
        unidadesVendidas: soldUnitsCount,
        totalExpenses
    };
}

export function filterExpenses(expenses: Expense[], insumo: string | null, dias: number | null): Expense[] {
    let filtered = [...expenses];
    if (insumo) filtered = filtered.filter(e => normalizar(e.description).includes(normalizar(insumo)));
    if (dias) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - dias);
        filtered = filtered.filter(e => new Date(e.date) >= cutoff);
    }
    return filtered;
}

// ==========================================
// EXTRAÇÃO DE ENTIDADES (Lógica Principal)
// ==========================================

export function extractEntities(text: string, projects: Project[]) {
    const normalized = normalizar(text);
    const PALAVRAS_IGNORADAS = ['obra', 'projeto', 'residencial', 'edificio', 'condominio', 'loteamento', 'construcao', 'reforma'];

    // Comparação
    const temComparacao = KEYWORDS.COMPARACAO.some(k => normalized.includes(k));
    if (temComparacao) {
        return { consulta: 'MULTI_OBRA', escopoConfirmado: 'MULTI_OBRA', obra: null, insumo: null, acao: 'NONE' };
    }

    // Identificar Obra
    let obra: { id: string; nome: string } | null = null;
    const numbers = text.match(/\d+/g);
    if (numbers) {
        for (const num of numbers) {
            const found = projects.find(p => normalizar(p.name).includes(num));
            if (found) {
                obra = { id: found.id, nome: found.name };
                break;
            }
        }
    }
    if (!obra) {
        for (const project of projects) {
            const nameParts = normalizar(project.name).split(/\s+/).filter(p => p.length > 2 && !PALAVRAS_IGNORADAS.includes(p));
            for (const part of nameParts) {
                if (new RegExp(`\\b${part}\\b`, 'i').test(normalized)) {
                    obra = { id: project.id, nome: project.name };
                    break;
                }
            }
            if (obra) break;
        }
    }

    // Escopo Multi
    let escopoConfirmado = 'SINGULAR';
    if (KEYWORDS.MULTI_OBRA.some(k => normalized.includes(k))) {
        escopoConfirmado = 'MULTI_OBRA';
        obra = null;
    }

    // Insumo
    let insumo: string | null = null;
    for (const k of KEYWORDS.DESPESAS_INSUMO) {
        if (normalized.includes(k)) { insumo = k; break; }
    }

    // Consulta
    let consulta = 'GERAL';
    if (escopoConfirmado === 'MULTI_OBRA') consulta = 'MULTI_OBRA';
    else if (insumo) consulta = 'DESPESAS_INSUMO';
    else if (KEYWORDS.ALERTAS.some(k => normalized.includes(k))) consulta = 'ALERTAS';
    else if (KEYWORDS.MARGEM.some(k => normalized.includes(k))) consulta = 'MARGEM';
    else if (KEYWORDS.ORCAMENTO.some(k => normalized.includes(k))) consulta = 'ORCAMENTO';
    else if (KEYWORDS.DESPESAS_GERAL.some(k => normalized.includes(k))) consulta = 'DESPESAS_GERAL';
    else if (KEYWORDS.PROGRESSO.some(k => normalized.includes(k))) consulta = 'PROGRESSO';
    else if (KEYWORDS.CRONOGRAMA.some(k => normalized.includes(k))) consulta = 'CRONOGRAMA';
    else if (KEYWORDS.DIARIO.some(k => normalized.includes(k))) consulta = 'DIARIO';
    else if (KEYWORDS.VENDAS.some(k => normalized.includes(k))) consulta = 'VENDAS';
    else if (KEYWORDS.DISPONIVEIS.some(k => normalized.includes(k))) consulta = 'DISPONIVEIS';

    // Ação
    let acao: any = 'NONE';
    let dadosAcao: any = {};

    if (KEYWORDS.ADD_DIARY.some(k => normalized.includes(k))) {
        acao = 'ADD_DIARY';
        const match = text.match(/(?:anota|registra|diário:|diario:)\s*(.+)/i);
        if (match) dadosAcao.conteudo = match[1].trim();
    } else if (KEYWORDS.ADD_EXPENSE.some(k => normalized.includes(k))) {
        acao = 'ADD_EXPENSE';
        const valorMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:reais|R\$|mil)?/i);
        if (valorMatch) {
            let valor = parseFloat(valorMatch[1].replace(',', '.'));
            if (normalized.includes('mil')) valor *= 1000;
            dadosAcao.valor = valor;
        }
    }

    return { obra, insumo, consulta, acao, escopoConfirmado, dadosAcao };
}
