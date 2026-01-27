import { useState } from 'react';
import { useProjects } from './useProjects';
import { chatWithClaude, ChatResponse, ChatMessage } from '../lib/claude';
import { Project, Expense, Unit } from '../types';

// ==========================================
// TIPOS E CONSTANTES DO SCHEMA
// ==========================================

type ConsultaTipo =
    | 'DESPESAS_GERAL' | 'DESPESAS_INSUMO' | 'ORCAMENTO' | 'MARGEM'
    | 'PROGRESSO' | 'ETAPAS' | 'DIARIO' | 'CRONOGRAMA'
    | 'UNIDADES' | 'VENDAS' | 'DISPONIVEIS'
    | 'DOCUMENTOS' | 'ALERTAS' | 'GERAL'
    | 'MULTI_OBRA';

type AcaoTipo = 'ADD_DIARY' | 'ADD_EXPENSE' | 'ADD_UNIT' | 'NONE';
type EscopoTipo = 'SINGULAR' | 'MULTI_OBRA';
type PeriodoTipo = 'HOJE' | 'ONTEM' | 'SEMANA_ATUAL' | 'ULTIMOS_7_DIAS' | 'MES_ATUAL' | 'GERAL';

interface PeriodoEstruturado {
    tipo: PeriodoTipo;
    label: string;
    dias: number;
}

interface EntidadesExtraidas {
    obra: { id: string; nome: string } | null;
    insumo: string | null;
    periodo: PeriodoEstruturado | null;
    consulta: ConsultaTipo;
    acao: AcaoTipo;
    escopoConfirmado: EscopoTipo;
    dadosAcao: {
        conteudo?: string;
        valor?: number;
        descricao?: string;
        identificador?: string;
        area?: number;
        custo?: number;
        valorVenda?: number;
    };
}

// Keywords organizadas
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
    // Plural/Panorama (MULTI_OBRA) - EXPANDIDO
    MULTI_OBRA: [
        'obras', 'todas', 'panorama', 'todas as obras', 'minhas obras', 'meus projetos',
        'resumo geral', 'visao geral', 'todas obras', 'projetos', 'tudo',
        'como estao', 'como estão', 'como estao as obras', 'status de todas',
        'todas minhas', 'geral de todas', 'resumo de todas', 'no total', 'no geral', 'soma', 'consolidado',
        'concluidas', 'finalizadas', 'prontas', 'entregues', 'em construcao', 'em construção', 'andamento'
    ],
    PANORAMA: ['resumo', 'visao', 'status geral', 'geral', 'panorama geral'],
    // COMPARAÇÃO - SEMPRE MULTI_OBRA (mesmo com "obra" singular)
    COMPARACAO: [
        // Qual + melhor/pior
        'qual obra esta pior', 'qual obra está pior', 'qual esta pior', 'qual está pior',
        'qual obra esta melhor', 'qual obra está melhor', 'qual esta melhor', 'qual está melhor',
        'qual melhor', 'qual pior', 'compare', 'comparar', 'comparando',
        // Rankings
        'ranking', 'rankear', 'ordenar', 'ordenadas', 'melhores', 'piores',
        // Atraso
        'mais atrasada', 'menos atrasada',
        // Custo/Gasto
        'mais cara', 'mais barata', 'gastou mais', 'gastou menos', 'maior gasto', 'menor gasto',
        'qual obra gastou', 'maior custo', 'menor custo', 'mais despesas', 'menos despesas',
        // Margem/ROI
        'maior margem', 'menor margem', 'maior roi', 'menor roi',
        // Vendas/Unidades
        'mais vendas', 'menos vendas', 'mais vendida', 'menos vendida',
        'mais unidades', 'menos unidades', 'mais avancada', 'mais avançada'
    ],
    // Ações
    ADD_DIARY: ['anota', 'registra', 'escreve no diario', 'diario:', 'anotacao:'],
    ADD_EXPENSE: ['adiciona despesa', 'nova despesa', 'gasto de', 'paguei', 'comprei'],
    ADD_UNIT: ['adiciona unidade', 'nova casa', 'novo apto', 'cadastra unidade', 'nova unidade'],
};

// Períodos estruturados
const PERIODOS: Array<{ keywords: string[]; tipo: PeriodoTipo; label: string; dias: number }> = [
    { keywords: ['hoje'], tipo: 'HOJE', label: 'Hoje', dias: 1 },
    { keywords: ['ontem'], tipo: 'ONTEM', label: 'Ontem', dias: 2 },
    { keywords: ['semana', 'semanal', 'essa semana', 'esta semana'], tipo: 'SEMANA_ATUAL', label: 'Esta semana', dias: 7 },
    { keywords: ['mes', 'mensal', 'esse mes', 'este mes'], tipo: 'MES_ATUAL', label: 'Este mês', dias: 30 },
    { keywords: ['ultimos dias', 'ultimos 7'], tipo: 'ULTIMOS_7_DIAS', label: 'Últimos 7 dias', dias: 7 },
];

const STAGE_NAMES: Record<number, string> = {
    0: 'Planejamento', 10: 'Fundação', 20: 'Estrutura', 30: 'Alvenaria',
    40: 'Cobertura', 50: 'Instalações', 60: 'Revestimentos', 70: 'Esquadrias',
    80: 'Acabamentos', 90: 'Finalização', 100: 'Concluída'
};

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

// Normalizar texto (remove acentos)
function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

// Campos canônicos (EXATA fórmula do dashboard)
interface CamposCanonicos {
    roi: number | null;
    roiMensal: number | null;
    unidadesVendidas: number;
    totalExpenses: number;
}

function calcularCamposCanonicos(project: Project): CamposCanonicos {
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

function calculateMonthsBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()));
}

function filterExpenses(expenses: Expense[], insumo: string | null, dias: number | null): Expense[] {
    let filtered = [...expenses];
    if (insumo) filtered = filtered.filter(e => normalizar(e.description).includes(normalizar(insumo)));
    if (dias) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - dias);
        filtered = filtered.filter(e => new Date(e.date) >= cutoff);
    }
    return filtered;
}

function verificarAlertas(project: Project): string[] {
    const alertas: string[] = [];
    const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;
    const gasto = project.expenses.reduce((s, e) => s + e.value, 0);
    const percentualGasto = orcamento > 0 ? (gasto / orcamento) * 100 : 0;

    if (percentualGasto > 100) alertas.push(`⚠️ ORÇAMENTO ESTOURADO: ${percentualGasto.toFixed(0)}%`);
    else if (percentualGasto > 90) alertas.push(`⚡ Orçamento crítico: ${percentualGasto.toFixed(0)}%`);

    if (project.deliveryDate) {
        const diasRestantes = Math.ceil((new Date(project.deliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diasRestantes < 0) alertas.push(`🚨 ATRASO: ${Math.abs(diasRestantes)} dias`);
        else if (diasRestantes < 30 && project.progress < 80) alertas.push(`⏰ Risco: ${diasRestantes} dias para entrega`);
    }

    const disponiveis = project.units.filter(u => u.status === 'Available').length;
    if (disponiveis > 0 && project.progress > 70) alertas.push(`📊 ${disponiveis} unidade(s) disponível(is)`);

    return alertas;
}

// ==========================================
// EXTRAÇÃO DE ENTIDADES
// ==========================================

function extractEntities(text: string, projects: Project[], history: ChatMessage[]): EntidadesExtraidas {
    const normalized = normalizar(text);
    // REMOVIDO: const fullContext = normalizar([...history.map(h => h.content), text].join(' '));
    // MULTI_OBRA e COMPARAÇÃO dependem ESTRITAMENTE da mensagem atual

    // 0. DETECTAR COMPARAÇÃO PRIMEIRO (apenas na mensagem atual)
    const comparacaoMatch = KEYWORDS.COMPARACAO.filter(k => normalized.includes(k));
    const temComparacao = comparacaoMatch.length > 0;

    console.log('🔎 DEBUG COMPARAÇÃO:', {
        textoNormalizado: normalized,
        keywordsComparacaoEncontradas: comparacaoMatch,
        temComparacao
    });

    if (temComparacao) {
        return {
            obra: null,
            insumo: null,
            periodo: null,
            consulta: 'MULTI_OBRA',
            acao: 'NONE',
            escopoConfirmado: 'MULTI_OBRA',
            dadosAcao: {}
        };
    }

    // LISTA NEGRA DE PALAVRAS COMUNS PARA NÃO CASAR COMO OBRA
    const PALAVRAS_IGNORADAS = ['obra', 'projeto', 'residencial', 'edificio', 'condominio', 'loteamento', 'construcao', 'reforma'];

    // 1. TENTAR IDENTIFICAR OBRA NA MENSAGEM ATUAL (Prioridade Máxima)
    let obra: EntidadesExtraidas['obra'] = null;

    // 1a. Procura por números explícitos no texto atual (ex: "obra 34")
    const numbers = text.match(/\d+/g);
    if (numbers) {
        for (const num of numbers) {
            // Tenta casar número exato no nome do projeto
            const found = projects.find(p => normalizar(p.name).includes(num));
            if (found) {
                obra = { id: found.id, nome: found.name };
                console.log(`🏠 Obra identificada por NÚMERO (${num}):`, found.name);
                break;
            }
        }
    }

    // 1b. Se não achou por número, procura por partes do nome no texto atual
    if (!obra) {
        for (const project of projects) {
            const nameParts = normalizar(project.name)
                .split(/\s+/)
                .filter(p => p.length > 2 && !PALAVRAS_IGNORADAS.includes(p)); // Ignora palavras comuns

            for (const part of nameParts) {
                // Regex para garantir match de palavra inteira (evita que "obras" case com "obra")
                const regex = new RegExp(`\\b${part}\\b`, 'i');
                if (regex.test(normalized)) {
                    obra = { id: project.id, nome: project.name };
                    console.log(`🏠 Obra identificada por NOME PARCIAL (${part}):`, project.name);
                    break;
                }
            }
            if (obra) break;
        }
    }

    // 2. DETECTAR ESCOPO (SINGULAR vs MULTI_OBRA) NA MENSAGEM ATUAL
    let escopoConfirmado: EscopoTipo = 'SINGULAR';
    const multiObraMatch = KEYWORDS.MULTI_OBRA.filter(k => normalized.includes(k));
    const panoramaMatch = KEYWORDS.PANORAMA.filter(k => normalized.includes(k));

    if (multiObraMatch.length > 0 || panoramaMatch.length > 0) {
        escopoConfirmado = 'MULTI_OBRA';
        obra = null; // Se pediu panorama de todas, ignora obra específica mencionada
        console.log('🌐 MULTI_OBRA ATIVADO: Plural/Panorama detectado');
    }

    // 3. RECUPERAR CONTEXTO DO HISTÓRICO (Sticky Context)
    // Se não achou obra, não é multi-obra, verifica se a IA estava falando de alguém
    if (!obra && escopoConfirmado === 'SINGULAR') {
        const lastAssistantMsg = [...history].reverse().find(h => h.role === 'assistant');
        if (lastAssistantMsg) {
            // Procura nomes de projetos na última resposta da IA
            for (const p of projects) {
                // Verifica se o nome Exato ou partes significativas aparecem
                if (normalizar(lastAssistantMsg.content).includes(normalizar(p.name))) {
                    obra = { id: p.id, nome: p.name };
                    console.log(`🧠 Contexto Adesivo: Continuando conversa sobre`, p.name);
                    break;
                }
            }
        }
    }

    // 3. EXTRAIR INSUMO (Busca na mensagem atual e depois no histórico recente se for continuação)
    let insumo: string | null = null;
    // Busca no texto atual
    for (const keyword of KEYWORDS.DESPESAS_INSUMO) {
        if (normalized.includes(keyword)) { insumo = keyword; break; }
    }
    // Se não achou e parece continuação (frase curta, pergunta), olha o último
    // Ex: "e cimento?" -> acha cimento. "quanto gastou?" -> pode querer saber do cimento anterior?
    // Por segurança, vamos focar no texto atual para evitar confusão.

    // 4. PERÍODO
    let periodo: PeriodoEstruturado | null = null;
    for (const p of PERIODOS) {
        if (p.keywords.some(kw => normalized.includes(kw))) {
            periodo = { tipo: p.tipo, label: p.label, dias: p.dias };
            break;
        }
    }

    // 5. TIPO DE CONSULTA
    let consulta: ConsultaTipo = 'GERAL';
    if (escopoConfirmado === 'MULTI_OBRA') consulta = 'MULTI_OBRA';
    else if (KEYWORDS.ALERTAS.some(k => normalized.includes(k))) consulta = 'ALERTAS';
    else if (insumo) consulta = 'DESPESAS_INSUMO';
    else if (KEYWORDS.MARGEM.some(k => normalized.includes(k))) consulta = 'MARGEM';
    else if (KEYWORDS.ORCAMENTO.some(k => normalized.includes(k))) consulta = 'ORCAMENTO';
    else if (KEYWORDS.DESPESAS_GERAL.some(k => normalized.includes(k))) consulta = 'DESPESAS_GERAL';
    else if (KEYWORDS.PROGRESSO.some(k => normalized.includes(k))) consulta = 'PROGRESSO';
    else if (KEYWORDS.CRONOGRAMA.some(k => normalized.includes(k))) consulta = 'CRONOGRAMA';
    else if (KEYWORDS.DIARIO.some(k => normalized.includes(k))) consulta = 'DIARIO';
    else if (KEYWORDS.VENDAS.some(k => normalized.includes(k))) consulta = 'VENDAS';
    else if (KEYWORDS.DISPONIVEIS.some(k => normalized.includes(k))) consulta = 'DISPONIVEIS';
    else if (KEYWORDS.UNIDADES.some(k => normalized.includes(k))) consulta = 'UNIDADES';
    else if (KEYWORDS.DOCUMENTOS.some(k => normalized.includes(k))) consulta = 'DOCUMENTOS';

    // 6. AÇÃO
    let acao: AcaoTipo = 'NONE';
    let dadosAcao: EntidadesExtraidas['dadosAcao'] = {};

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
    } else if (KEYWORDS.ADD_UNIT.some(k => normalized.includes(k))) {
        acao = 'ADD_UNIT';
        const idMatch = text.match(/(?:casa|apto|unidade)\s*(\d+|\w+)/i);
        if (idMatch) dadosAcao.identificador = idMatch[0].trim();
    }

    console.log('🔍 Entidades (v2.2):', { obra: obra?.nome, insumo, periodo: periodo?.label, consulta, escopoConfirmado, acao });
    return { obra, insumo, periodo, consulta, acao, escopoConfirmado, dadosAcao };
}

// ==========================================
// HOOK PRINCIPAL
// ==========================================

export const useProjectBrain = (): { loading: boolean; processMessage: (message: string, history: ChatMessage[], currentProjectId?: string | null) => Promise<ChatResponse> } => {
    const { data: projects = [] } = useProjects();
    const [loading, setLoading] = useState(false);

    const processMessage = async (message: string, history: ChatMessage[], currentProjectId?: string | null): Promise<ChatResponse> => {
        setLoading(true);
        console.log("🧠 Brain v2.1: Processando - COMPARAÇÃO PRIMEIRO");
        console.log("📦 currentProjectId recebido:", currentProjectId);

        try {
            const entities = extractEntities(message, projects, history);

            // MULTI_OBRA: não usar obra ativa
            const obraId = entities.escopoConfirmado === 'MULTI_OBRA' ? null : (entities.obra?.id || currentProjectId);
            const project = obraId ? projects.find(p => p.id === obraId) : null;

            // Verificar se precisa de obra
            if (entities.escopoConfirmado === 'SINGULAR' && entities.consulta !== 'GERAL' && !project && entities.acao === 'NONE') {
                return {
                    text: `Não identifiquei qual obra você se refere. Você quer ver os dados de uma obra específica ou o **total consolidado** de todas?\n\n**Obras disponíveis:** ${projects.map(p => p.name).join(', ')}.`,
                    action: { type: 'NONE' }
                };
            }

            let dadosFiltrados: any = null;

            switch (entities.consulta) {
                case 'MULTI_OBRA':
                    dadosFiltrados = {
                        tipo: 'MULTI_OBRA',
                        origem: 'BACKEND',
                        totalObras: projects.length,
                        periodo: entities.periodo || { tipo: 'GERAL', label: 'Geral', dias: 0 },
                        obras: projects.map(p => {
                            const canonicos = calcularCamposCanonicos(p);
                            const vendidas = p.units.filter(u => u.status === 'Sold').length;
                            const alertas = verificarAlertas(p);
                            const totalGasto = p.expenses.reduce((s, e) => s + e.value, 0);
                            const orcamento = p.budget?.totalEstimated || p.expectedTotalCost || 0;
                            const duracao = calcularDuracao(p);
                            return {
                                id: p.id,
                                nome: p.name,
                                // Dados de Contexto (Padronizado)
                                progresso: `${p.progress}% (${duracao.diasCorridos} dias)`,
                                etapa: STAGE_NAMES[p.progress] || 'Em andamento',
                                unidades: `${vendidas}/${p.units.length} unidades`,
                                unidadesVendidas: vendidas,
                                unidadesTotais: p.units.length,
                                unidadesDisponiveis: p.units.filter(u => u.status === 'Available').length,
                                totalGasto: totalGasto,
                                totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                                orcamento: orcamento,
                                percentualOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(0)}%` : null,
                                roi: canonicos.roi !== null ? `${canonicos.roi.toFixed(1)}%` : null,
                                temAlerta: alertas.length > 0,
                                alertas
                            };
                        }),
                        resumoGlobal: {
                            totalObras: projects.length,
                            unidadesTotais: projects.reduce((s, p) => s + p.units.length, 0),
                            unidadesVendidas: projects.reduce((s, p) => s + p.units.filter(u => u.status === 'Sold').length, 0),
                            unidadesDisponiveis: projects.reduce((s, p) => s + p.units.filter(u => u.status === 'Available').length, 0),

                            // Segmentação: Concluídas (100%)
                            unidadesConcluidas: projects.reduce((s, p) => s + (p.progress >= 100 ? p.units.length : 0), 0),
                            valorUnidadesConcluidas: projects.reduce((s, p) => s + (p.progress >= 100 ? p.units.reduce((sum, u) => sum + (u.saleValue || u.valorEstimadoVenda || 0), 0) : 0), 0),

                            // Segmentação: Em Construção (< 100%)
                            unidadesEmConstrucao: projects.reduce((s, p) => s + (p.progress < 100 ? p.units.length : 0), 0),
                            unidadesVendidasEmConstrucao: projects.reduce((s, p) => s + (p.progress < 100 ? p.units.filter(u => u.status === 'Sold').length : 0), 0),
                            unidadesDisponiveisEmConstrucao: projects.reduce((s, p) => s + (p.progress < 100 ? p.units.filter(u => u.status === 'Available').length : 0), 0),
                            valorVendasEmConstrucao: projects.reduce((s, p) => s + (p.progress < 100 ? p.units.filter(u => u.status === 'Sold').reduce((sum, u) => sum + (u.saleValue || 0), 0) : 0), 0),
                            valorEstoqueEmConstrucao: projects.reduce((s, p) => s + (p.progress < 100 ? p.units.filter(u => u.status === 'Available').reduce((sum, u) => sum + (u.saleValue || u.valorEstimadoVenda || 0), 0) : 0), 0),

                            valorTotalVendasRealizadas: projects.reduce((s, p) => s + p.units.filter(u => u.status === 'Sold').reduce((sum, unit) => sum + (unit.saleValue || 0), 0), 0),
                            totalGastoGlobal: projects.reduce((s, p) => s + p.expenses.reduce((sum, e) => sum + e.value, 0), 0),
                            orcamentoGlobal: projects.reduce((s, p) => s + (p.budget?.totalEstimated || p.expectedTotalCost || 0), 0),
                        },
                        calculoPermitido: false
                    };
                    break;

                case 'DESPESAS_INSUMO':
                    if (project && entities.insumo) {
                        const despesas = filterExpenses(project.expenses, entities.insumo, entities.periodo?.dias || null);
                        dadosFiltrados = {
                            tipo: 'DESPESAS_INSUMO',
                            origem: 'BACKEND',
                            insumo: entities.insumo,
                            periodo: entities.periodo || { tipo: 'GERAL', label: 'Todo período', dias: 0 },
                            quantidade: despesas.length,
                            valorTotal: despesas.reduce((s, e) => s + e.value, 0),
                            itens: despesas.map(e => ({ data: e.date, desc: e.description, valor: e.value })),

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            etapa: STAGE_NAMES[project.progress],

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'DESPESAS_GERAL':
                    if (project) {
                        const totalGasto = project.expenses.reduce((s, e) => s + e.value, 0);
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;

                        // Etapas (Macros)
                        const etapas = project.budget?.macros?.map(m => ({
                            nome: m.name,
                            valorGasto: m.spentValue,
                            valorGastoFormatado: `R$ ${m.spentValue.toLocaleString('pt-BR')}`,
                            valorOrcado: m.estimatedValue,
                            // Sub-macros
                            detalhes: m.subMacros?.map(sm => ({
                                nome: sm.name,
                                valorGasto: sm.spentValue,
                                valorGastoFormatado: `R$ ${sm.spentValue.toLocaleString('pt-BR')}`,
                                valorOrcado: sm.estimatedValue
                            })) || []
                        })) || [];

                        // Últimas 10 despesas
                        const ultimasDespesas = project.expenses
                            .slice(-10)
                            .map(e => ({ data: e.date, desc: e.description, valor: e.value }));

                        dadosFiltrados = {
                            tipo: 'DESPESAS_GERAL',
                            origem: 'BACKEND',
                            obraNome: project.name,
                            totalGasto: totalGasto,
                            totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                            orcamentoTotal: orcamento,
                            percentualDoOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(1)}%` : null,
                            etapas: etapas,
                            ultimasDespesas: ultimasDespesas,

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            etapa: STAGE_NAMES[project.progress],

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'MARGEM':
                    if (project) {
                        const canonicos = calcularCamposCanonicos(project);
                        dadosFiltrados = {
                            tipo: 'MARGEM',
                            origem: 'BACKEND',
                            margemRoi: canonicos.roi !== null ? `${canonicos.roi.toFixed(1)}%` : 'Sem vendas para calcular',
                            roiMensal: canonicos.roiMensal !== null ? `${canonicos.roiMensal.toFixed(2)}%` : null,
                            unidadesBase: canonicos.unidadesVendidas,

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            totalGasto: project.expenses.reduce((s, e) => s + e.value, 0),
                            totalGastoFormatado: `R$ ${project.expenses.reduce((s, e) => s + e.value, 0).toLocaleString('pt-BR')}`,
                            orcamentoTotal: project.budget?.totalEstimated || project.expectedTotalCost || 0,
                            percentualOrcamento: (project.budget?.totalEstimated || project.expectedTotalCost || 0) > 0 ? `${((project.expenses.reduce((s, e) => s + e.value, 0) / (project.budget?.totalEstimated || project.expectedTotalCost || 0)) * 100).toFixed(0)}%` : null,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'ETAPAS':
                    if (project) {
                        const completas = Object.keys(STAGE_NAMES).filter(k => Number(k) <= project.progress).map(k => STAGE_NAMES[Number(k)]);
                        const proxima = STAGE_NAMES[Math.min(project.progress + 10, 100)];
                        const totalGasto = project.expenses.reduce((s, e) => s + e.value, 0);
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;

                        dadosFiltrados = {
                            tipo: 'ETAPAS',
                            origem: 'BACKEND',
                            etapaAtual: STAGE_NAMES[project.progress],
                            etapasConcluidas: completas,
                            proximaEtapa: proxima,

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias de obra)`,
                            totalGasto: totalGasto,
                            totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                            orcamentoTotal: orcamento,
                            percentualOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(0)}%` : null,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'ORCAMENTO':
                    if (project) {
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;
                        const gasto = project.expenses.reduce((s, e) => s + e.value, 0);

                        // Incluir macros (etapas) se existirem
                        const etapas = project.budget?.macros?.map(m => ({
                            nome: m.name,
                            valorOrcado: m.estimatedValue,
                            valorOrcadoFormatado: `R$ ${m.estimatedValue.toLocaleString('pt-BR')}`,
                            valorGasto: m.spentValue,
                            valorGastoFormatado: `R$ ${m.spentValue.toLocaleString('pt-BR')}`,
                            percentualGasto: m.estimatedValue > 0 ? `${((m.spentValue / m.estimatedValue) * 100).toFixed(1)}%` : '0%',
                            percentualDoTotal: m.percentage ? `${m.percentage}%` : null,
                            // Sub-macros (detalhes)
                            detalhes: m.subMacros?.map(sm => ({
                                nome: sm.name,
                                valorOrcado: sm.estimatedValue,
                                valorGasto: sm.spentValue,
                                percentualGasto: sm.estimatedValue > 0 ? `${((sm.spentValue / sm.estimatedValue) * 100).toFixed(1)}%` : '0%'
                            })) || []
                        })) || [];

                        dadosFiltrados = {
                            tipo: 'ORCAMENTO',
                            origem: 'BACKEND',
                            obraNome: project.name,
                            orcamentoTotal: orcamento,
                            orcamentoTotalFormatado: `R$ ${orcamento.toLocaleString('pt-BR')}`,
                            totalGasto: gasto,
                            totalGastoFormatado: `R$ ${gasto.toLocaleString('pt-BR')}`,
                            saldoRestante: orcamento - gasto,
                            saldoRestanteFormatado: `R$ ${(orcamento - gasto).toLocaleString('pt-BR')}`,
                            percentualConsumido: orcamento > 0 ? `${((gasto / orcamento) * 100).toFixed(1)}%` : '0%',
                            etapas: etapas,
                            temEtapas: etapas.length > 0,

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            etapa: STAGE_NAMES[project.progress],

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'PROGRESSO':
                    if (project) {
                        dadosFiltrados = {
                            tipo: 'PROGRESSO',
                            origem: 'BACKEND',
                            percentual: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias de obra)`,
                            etapaAtual: STAGE_NAMES[project.progress],                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            etapa: STAGE_NAMES[project.progress],
                            totalGasto: project.expenses.reduce((s, e) => s + e.value, 0),
                            totalGastoFormatado: `R$ ${project.expenses.reduce((s, e) => s + e.value, 0).toLocaleString('pt-BR')}`,
                            orcamentoTotal: project.budget?.totalEstimated || project.expectedTotalCost || 0,
                            percentualOrcamento: (project.budget?.totalEstimated || project.expectedTotalCost || 0) > 0 ? `${((project.expenses.reduce((s, e) => s + e.value, 0) / (project.budget?.totalEstimated || project.expectedTotalCost || 0)) * 100).toFixed(0)}%` : null,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'ALERTAS':
                    if (project) {
                        const alertas = verificarAlertas(project);
                        const totalGasto = project.expenses.reduce((s, e) => s + e.value, 0);
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;

                        dadosFiltrados = {
                            tipo: 'ALERTAS',
                            origem: 'BACKEND',
                            temAlertas: alertas.length > 0,
                            listaAlertas: alertas,
                            mensagemSeVazio: alertas.length === 0 ? 'Nenhum alerta. Tudo dentro do esperado.' : null,

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            totalGasto: totalGasto,
                            totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                            orcamentoTotal: orcamento,
                            percentualOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(0)}%` : null,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'UNIDADES':
                case 'VENDAS':
                case 'DISPONIVEIS':
                    if (project) {
                        const vendidas = project.units.filter(u => u.status === 'Sold');
                        const disponiveis = project.units.filter(u => u.status === 'Available');

                        // Lógica de "Concluídas" (Obras 100%)
                        const unidadesConcluidas = project.progress >= 100 ? project.units : [];
                        const valorConcluidas = unidadesConcluidas.reduce((s, u) => s + (u.saleValue || u.valorEstimadoVenda || 0), 0);

                        const lista = entities.consulta === 'VENDAS' ? vendidas : entities.consulta === 'DISPONIVEIS' ? disponiveis : project.units;

                        dadosFiltrados = {
                            tipo: entities.consulta,
                            origem: 'BACKEND',
                            totalUnidades: project.units.length,
                            quantidadeVendidas: vendidas.length,
                            quantidadeDisponiveis: disponiveis.length,
                            quantidadeConcluidas: unidadesConcluidas.length,
                            valorConcluidas: valorConcluidas,
                            valorConcluidasFormatado: `R$ ${valorConcluidas.toLocaleString('pt-BR')}`,
                            obraConcluida: project.progress >= 100,
                            lista: lista.map(u => ({ id: u.id, nome: u.identifier, area: `${u.area}m²`, status: u.status === 'Sold' ? 'Vendida' : 'Disponível', valor: u.saleValue || u.valorEstimadoVenda || 0 })),

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            totalGasto: project.expenses.reduce((s, e) => s + e.value, 0),
                            totalGastoFormatado: `R$ ${project.expenses.reduce((s, e) => s + e.value, 0).toLocaleString('pt-BR')}`,
                            orcamentoTotal: project.budget?.totalEstimated || project.expectedTotalCost || 0,
                            percentualOrcamento: (project.budget?.totalEstimated || project.expectedTotalCost || 0) > 0 ? `${((project.expenses.reduce((s, e) => s + e.value, 0) / (project.budget?.totalEstimated || project.expectedTotalCost || 0)) * 100).toFixed(0)}%` : null,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'DIARIO':
                    if (project) {
                        const totalGasto = project.expenses.reduce((s, e) => s + e.value, 0);
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;

                        dadosFiltrados = {
                            tipo: 'DIARIO',
                            origem: 'BACKEND',
                            totalEntradas: project.diary.length,
                            ultimasEntradas: project.diary.slice(-5).map(d => ({ data: d.date, texto: d.content, autor: d.author })),

                            // Dados de Contexto (Padronizado)
                            progresso: `${project.progress}% (${calcularDuracao(project).diasCorridos} dias)`,
                            totalGasto: totalGasto,
                            totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                            orcamentoTotal: orcamento,
                            percentualOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(0)}%` : null,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'CRONOGRAMA':
                    if (project) {
                        const diasRestantes = project.deliveryDate ? Math.ceil((new Date(project.deliveryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

                        // Nova lógica de duração
                        const duracao = calcularDuracao(project);
                        const totalGasto = project.expenses.reduce((s, e) => s + e.value, 0);
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;
                        const alertas = verificarAlertas(project);

                        dadosFiltrados = {
                            tipo: 'CRONOGRAMA',
                            origem: 'BACKEND',
                            dataInicio: project.startDate || 'Não definida',
                            dataInicioConsiderada: duracao.dataInicio || 'Não identificada',
                            origemDataInicio: duracao.origem,
                            tempoDecorrido: duracao.dataInicio ? `${duracao.diasCorridos} dias` : 'Não iniciado',
                            dataEntrega: project.deliveryDate || 'Não definida',
                            diasRestantes: diasRestantes !== null ? diasRestantes : 'Indefinido',
                            situacao: diasRestantes !== null ? (diasRestantes < 0 ? 'ATRASADO' : diasRestantes < 30 ? 'CRÍTICO' : 'NO PRAZO') : 'INDEFINIDO',

                            // Dados Financeiros e de Status para Contexto Geral
                            totalGasto: totalGasto,
                            totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                            orcamentoTotal: orcamento,
                            percentualOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(0)}%` : null,
                            progresso: `${project.progress}%`,
                            etapa: STAGE_NAMES[project.progress],
                            temAlerta: alertas.length > 0,
                            alertas: alertas,

                            calculoPermitido: false
                        };
                    }
                    break;

                case 'GERAL':
                    if (project) {
                        const canonicos = calcularCamposCanonicos(project);
                        const duracao = calcularDuracao(project);
                        const totalGasto = project.expenses.reduce((s, e) => s + e.value, 0);
                        const orcamento = project.budget?.totalEstimated || project.expectedTotalCost || 0;
                        const alertas = verificarAlertas(project);

                        dadosFiltrados = {
                            tipo: 'GERAL',
                            origem: 'BACKEND',
                            nome: project.name,

                            // Dados Padronizados (Financeiro + Tempo + Progresso)
                            progresso: `${project.progress}% (${duracao.diasCorridos} dias de obra)`,
                            etapa: STAGE_NAMES[project.progress],
                            tempoDecorrido: duracao.dataInicio ? `${duracao.diasCorridos} dias` : 'Indefinido',
                            totalGasto: totalGasto,
                            totalGastoFormatado: `R$ ${totalGasto.toLocaleString('pt-BR')}`,
                            orcamentoTotal: orcamento,
                            percentualOrcamento: orcamento > 0 ? `${((totalGasto / orcamento) * 100).toFixed(0)}%` : null,
                            temAlerta: alertas.length > 0,
                            alertas: alertas,

                            roi: canonicos.roi !== null ? `${canonicos.roi.toFixed(1)}%` : null,
                            unidadesVendidas: `${project.units.filter(u => u.status === 'Sold').length}/${project.units.length}`,
                            calculoPermitido: false
                        };
                    }
                    break;
            }

            // Montar contexto final
            const context = {
                escopoConfirmado: entities.escopoConfirmado,
                entidades: {
                    obra: entities.obra?.nome || project?.name || null,
                    obraId,
                    insumo: entities.insumo,
                    tipoConsulta: entities.consulta,
                },
                periodo: entities.periodo || { tipo: 'GERAL', label: 'Geral' },
                dadosFiltrados,
                acaoPendente: entities.acao !== 'NONE' ? {
                    tipo: entities.acao,
                    dados: entities.dadosAcao,
                    obraId,
                    obraNome: project?.name,
                    completo: verificarDadosCompletos(entities.acao, entities.dadosAcao, obraId)
                } : null,
                regras: {
                    calculoPermitido: false,
                    origem: 'BACKEND',
                    instrucao: 'Use APENAS valores de dadosFiltrados. NUNCA recalcule.'
                }
            };

            return await chatWithClaude(message, history, context);

        } catch (error) {
            console.error("Brain Error:", error);
            return { text: "Erro ao processar. Tente novamente.", action: { type: 'NONE' } };
        } finally {
            setLoading(false);
        }
    };

    return { loading, processMessage };
};

function verificarDadosCompletos(acao: AcaoTipo, dados: EntidadesExtraidas['dadosAcao'], obraId: string | null | undefined): boolean {
    if (!obraId) return false;
    switch (acao) {
        case 'ADD_DIARY': return !!dados.conteudo;
        case 'ADD_EXPENSE': return !!dados.valor && !!dados.descricao;
        case 'ADD_UNIT': return !!dados.identificador && !!dados.area;
        default: return true;
    }
}

function calcularDuracao(project: Project): { dataInicio: string | null, diasCorridos: number, origem: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Data de Início Oficial
    if (project.startDate) {
        const start = new Date(project.startDate);
        const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        return {
            dataInicio: project.startDate,
            diasCorridos: Math.max(0, diff),
            origem: 'Data Oficial'
        };
    }

    // 2. Primeira Despesa
    if (project.expenses && project.expenses.length > 0) {
        // Encontrar a menor data
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
