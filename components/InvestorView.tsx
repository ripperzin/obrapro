import React, { useEffect, useState } from 'react';
import { Project, getStageName, PlanId, isPlanId } from '../types';
import { supabase } from '../supabaseClient';
import StageThumbnail from './StageThumbnail';
import ResultadoEmpreendimento from './ResultadoEmpreendimento';
import { daysSince, lastUpdatedLabel, mostRecentDate } from '../utils';
import { computeProjectFinance, computeGastoAvancoVerdito, computeAporteShares } from '../utils/projectFinance';
import { parseReportOptionsFromHash, clampReportOptions } from '../utils/reportOptions';
import { entitlementsFor } from '../hooks/useEntitlements';

// Mapeia o tom do veredito (Gasto × Avanço) para classes Tailwind do link.
const TONE_CLASSES: Record<string, { text: string; bar: string }> = {
    neutral: { text: 'text-slate-400', bar: 'bg-slate-600' },
    warning: { text: 'text-amber-400', bar: 'bg-amber-500' },
    good: { text: 'text-emerald-400', bar: 'bg-emerald-500' },
};

interface InvestorViewProps {
    projectId: string;
}

// Helper to format currency
const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
};

// Helper to format abbreviated currency
const formatCurrencyAbbrev = (value: number): string => {
    if (Math.abs(value) >= 1000000) {
        return `R$ ${(value / 1000000).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1000) {
        return `R$ ${(value / 1000).toFixed(0)}k`;
    }
    return formatCurrency(value);
};



const InvestorView: React.FC<InvestorViewProps> = ({ projectId }) => {
    // Opções do relatório vindas da URL (?off=despesas,resultado). Link e PDF
    // respeitam a mesma escolha feita pelo dono da obra ao compartilhar.
    const urlOptions = parseReportOptionsFromHash(window.location.hash);
    // Plano do DONO da obra, dito pelo servidor. Enquanto não chega, tratamos
    // como Free (corte seguro) — nunca mostrar seção paga por engano.
    const [ownerPlan, setOwnerPlan] = useState<PlanId>('free');
    const ownerEnt = entitlementsFor(ownerPlan);
    // A URL é editável por quem recebe o link; quem manda é o plano do dono.
    const options = clampReportOptions(urlOptions, ownerEnt.canShareFullReport);
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [itemsById, setItemsById] = useState<Record<string, string>>({});
    // Mapa { path -> signed URL } gerado pela edge function (service role).
    // O portal é anon e não acessa o Storage diretamente.
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchProject = async () => {
            try {
                // Validate projectId format (UUID)
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!projectId || !uuidRegex.test(projectId)) {
                    throw new Error(`ID de projeto inválido: ${projectId}`);
                }

                // Portal do Investidor é PÚBLICO (sem login). Em vez de ler as
                // tabelas direto (o que exigia abrir o banco para o role anon),
                // chamamos a edge function `investor-portal`, que devolve só os
                // dados desta obra usando a service role no servidor.
                const { data, error: fnError } = await supabase.functions.invoke('investor-portal', {
                    body: { projectId },
                });

                if (fnError) throw fnError;
                if (data?.error) throw new Error(data.error);

                const projectData = data?.project;
                if (!projectData) throw new Error('Projeto não encontrado no banco de dados');

                if (isPlanId(data?.ownerPlan)) setOwnerPlan(data.ownerPlan);

                const unitsData = data.units || [];
                const evidenceData = data.stageEvidences || [];
                const expensesData = data.expenses || [];
                const contributionsData = data.contributions || [];
                const acquisitionData = data.acquisitionCosts || [];
                const budgetData = data.budget || null;
                const macrosData: any[] = data.macros || [];
                const subMacrosData: any[] = data.subMacros || [];

                setSignedUrls(data.signedUrls || {});
                setExpenses(expensesData || []);
                const itemMap: Record<string, string> = {};
                for (const it of (data.items || [])) itemMap[it.id] = it.name;
                setItemsById(itemMap);

                const mappedProject: Project = {
                    id: projectData.id,
                    name: projectData.name,
                    startDate: projectData.start_date,
                    deliveryDate: projectData.delivery_date,
                    unitCount: projectData.unit_count || 0,
                    totalArea: projectData.total_area || 0,
                    expectedTotalCost: projectData.expected_total_cost || 0,
                    expectedTotalSales: projectData.expected_total_sales || 0,
                    progress: projectData.progress || 0,
                    splitMode: (projectData.split_mode as 'percent' | 'unit') || 'percent',
                    units: (unitsData || []).map((u: any) => ({
                        id: u.id,
                        identifier: u.identifier,
                        area: u.area,
                        cost: u.cost,
                        status: u.status,
                        valorEstimadoVenda: u.valor_estimado_venda,
                        saleValue: u.sale_value,
                        saleDate: u.sale_date,
                        ownerInvestorId: u.owner_investor_id || undefined
                    })),
                    expenses: (expensesData || []).map((e: any) => ({
                        id: e.id,
                        description: e.description,
                        value: e.value,
                        date: e.date,
                        userId: e.user_id,
                        userName: e.user_name,
                        attachmentUrl: e.attachment_url,
                        attachments: e.attachments || [],
                        paidByInvestorId: e.paid_by_investor_id || undefined,
                    })),
                    contributions: (contributionsData || []).map((c: any) => ({
                        id: '',
                        projectId: projectData.id,
                        investorId: c.investor_id || '',
                        value: c.value,
                        date: c.date,
                    })),
                    investors: ((data.investors || []) as any[]).map((i: any) => ({
                        id: i.id,
                        projectId: projectData.id,
                        name: i.name,
                    })),
                    acquisitionCosts: (acquisitionData || []).map((a: any) => ({
                        id: '',
                        projectId: projectData.id,
                        category: a.category || 'terreno',
                        value: a.value || 0,
                        date: a.date || '',
                        paidFromProject: a.paid_from_project ?? true,
                    })),
                    profitShares: ((data.profitShares || []) as any[]).map((s: any) => ({
                        id: s.id || '',
                        projectId: projectData.id,
                        investorId: s.investor_id || undefined,
                        name: s.name,
                        percentage: s.percentage || 0,
                        naoAporta: s.nao_aporta || false,
                    })),
                    logs: [],
                    documents: [],
                    diary: [],
                    stageEvidence: (evidenceData || []).map((e: any) => ({
                        stage: e.stage,
                        photos: e.photos || [],
                        date: e.date,
                        notes: e.notes,
                        user: e.user_name
                    })),
                    budget: budgetData ? {
                        id: budgetData.id,
                        projectId: budgetData.project_id,
                        totalEstimated: budgetData.total_estimated || 0,
                        totalValue: budgetData.total_value,
                        macros: macrosData.map((m: any) => ({
                            id: m.id,
                            budgetId: m.budget_id,
                            name: m.name,
                            percentage: m.percentage,
                            estimatedValue: m.estimated_value,
                            spentValue: m.spent_value || 0,
                            displayOrder: m.display_order,
                            // Sem isto o link diria uma etapa e o app outra (o
                            // canteiro voltaria a ser degrau do avanço só aqui).
                            timeBased: m.time_based || false,
                            subMacros: subMacrosData.filter((s: any) => s.project_macro_id === m.id).map((s: any) => ({
                                id: s.id,
                                projectMacroId: s.project_macro_id,
                                name: s.name,
                                percentage: s.percentage,
                                estimatedValue: s.estimated_value,
                                spentValue: s.spent_value || 0,
                                displayOrder: s.display_order
                            }))
                        }))
                    } : undefined
                };

                setProject(mappedProject);
            } catch (err: any) {
                setError(err.message || 'Erro ao carregar projeto');
            } finally {
                setLoading(false);
            }
        };

        fetchProject();
    }, [projectId]);

    // Componente auxiliar para link com assinatura.
    // O portal é anon: as signed URLs vêm prontas da edge function (mapa
    // signedUrls). Paths já em formato http passam direto.
    const FileLink = ({ path }: { path: string }) => {
        if (!path) return null;
        const url = path.startsWith('http') ? path : signedUrls[path];

        if (!url) return <span className="text-slate-600"><i className="fa-solid fa-spinner fa-spin"></i></span>;

        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors" title="Abrir Anexo">
                <i className="fa-solid fa-paperclip"></i>
            </a>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <i className="fa-solid fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i>
                    <p className="text-slate-400">Carregando informações do projeto...</p>
                </div>
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center bg-slate-800/50 rounded-3xl p-12 border border-slate-700">
                    <i className="fa-solid fa-triangle-exclamation text-5xl text-amber-400 mb-4"></i>
                    <h2 className="text-xl font-bold text-white mb-2">Projeto não encontrado</h2>
                    <p className="text-slate-400">{error || 'O projeto solicitado não existe ou foi removido.'}</p>
                </div>
            </div>
        );
    }

    // Fonte única de números — idêntica ao app e ao PDF.
    const finance = computeProjectFinance(project);
    const verdito = computeGastoAvancoVerdito(finance);
    const tone = TONE_CLASSES[verdito.tone];
    const investorName = (id?: string) => (project.investors || []).find(i => i.id === id)?.name;
    // A foto (quando aparece) já mostra a etapa atual; então só repetimos "Etapa atual"
    // no Gasto × Avanço quando a foto NÃO está no relatório.
    const heroPhoto = (project.stageEvidence || []).filter(e => e.photos && e.photos.length > 0).sort((a, b) => b.stage - a.stage)[0]?.photos?.[0];
    const heroPhotoShown = options.foto && !!heroPhoto;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <header className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-4 border border-blue-500/30">
                        <i className="fa-solid fa-chart-line"></i>
                        Portal do Investidor
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-white mb-2">{project.name}</h1>
                    <p className="text-slate-400 mb-3">
                        {project.startDate && `Início: ${new Date(project.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                        {project.startDate && project.deliveryDate && ' • '}
                        {project.deliveryDate && `Entrega: ${new Date(project.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                    </p>
                    {(() => {
                        const last = mostRecentDate([
                            ...(project.expenses || []).map(e => e.date),
                            ...(project.contributions || []).map(c => c.date),
                            ...(project.stageEvidence || []).map(s => s.date),
                        ]);
                        if (!last) return <div className="mb-8" />;
                        const days = daysSince(last);
                        return (
                            <div className="mb-8">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${days >= 14 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    <i className="fa-solid fa-clock-rotate-left"></i>
                                    {lastUpdatedLabel(days)}
                                </span>
                            </div>
                        );
                    })()}

                    {(() => {
                        // Find latest photo from stage evidence
                        const currentStageEvidence = (project.stageEvidence || [])
                            .filter(e => e.photos && e.photos.length > 0)
                            .sort((a, b) => b.stage - a.stage)[0];

                        const photo = currentStageEvidence?.photos?.[0];

                        if (photo && options.foto) {
                            return (
                                <div className="max-w-2xl mx-auto">
                                    <div className="rounded-3xl p-2 bg-slate-800/50 backdrop-blur border border-slate-700 shadow-2xl">
                                        <div className="rounded-2xl overflow-hidden aspect-video relative group">
                                            <StageThumbnail photoPath={photo} signedUrl={photo ? signedUrls[photo] : undefined} className="w-full h-full" />
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex justify-between items-end">
                                                <div>
                                                    <p className="text-white font-bold text-lg">{getStageName(currentStageEvidence.stage, project)}</p>
                                                    <p className="text-slate-300 text-sm">
                                                        <i className="fa-solid fa-camera mr-2"></i>
                                                        Registro de {new Date(currentStageEvidence.date).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </header>

                {/* 2) GASTO × AVANÇO — substitui o "Progresso Geral" (idêntico ao app) */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <h2 className="text-lg font-bold text-white">Gasto × Avanço</h2>
                        <span className="text-xs md:text-sm font-bold text-white whitespace-nowrap">
                            {finance.gastoPct.toFixed(0)}% gasto · {finance.progresso.toFixed(0)}% obra
                        </span>
                    </div>
                    <div className="relative bg-slate-800 rounded-full h-4 overflow-hidden border border-slate-700">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${tone.bar}`}
                            style={{ width: `${Math.min(finance.gastoPct, 100)}%` }}
                        />
                        {/* marcador branco do avanço físico */}
                        <div className="absolute top-0 bottom-0 w-1 bg-white" style={{ left: `${Math.min(finance.progresso, 100)}%` }} />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 gap-1">
                        <p className={`text-sm font-bold ${tone.text}`}>
                            <i className={`fa-solid ${verdito.icon} mr-1.5`}></i>{verdito.texto}
                        </p>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                            Gasto {formatCurrencyAbbrev(finance.gasto)} de {formatCurrencyAbbrev(finance.orcamentoObra)}
                        </span>
                    </div>
                    {!heroPhotoShown && (
                        <p className="text-slate-400 text-sm mt-3">
                            <i className="fa-solid fa-location-dot mr-2"></i>
                            Etapa atual: <span className="text-white font-medium">{getStageName(project.progress, project)}</span>
                        </p>
                    )}
                </div>

                {/* 3) ORÇAMENTO POR CATEGORIA (só a lista — a barra/totais já estão no Gasto × Avanço) */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8">
                    <h2 className="text-lg font-bold text-white mb-6">
                        <i className="fa-solid fa-scale-balanced mr-2 text-green-400"></i>
                        Orçamento por categoria
                    </h2>
                    <div className="space-y-6">
                        {project.budget && project.budget.macros && project.budget.macros.length > 0 ? (
                            project.budget.macros.sort((a, b) => a.displayOrder - b.displayOrder).map(macro => {
                                const percent = macro.estimatedValue > 0 ? (macro.spentValue / macro.estimatedValue) * 100 : 0;
                                const isOver = percent > 100;

                                return (
                                    <div key={macro.id} className="glass rounded-2xl p-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-bold">{macro.name}</span>
                                            </div>
                                            <span className={`text-sm font-bold ${isOver ? 'text-red-400' : 'text-green-400'}`}>
                                                {isOver && <i className="fa-solid fa-triangle-exclamation mr-1"></i>}
                                                {percent.toFixed(0)}%
                                            </span>
                                        </div>

                                        {/* Bar */}
                                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
                                            <div
                                                className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : 'bg-blue-500'}`}
                                                style={{ width: `${Math.min(percent, 100)}%` }}
                                            ></div>
                                        </div>

                                        {/* Values */}
                                        <div className="flex justify-between text-xs text-slate-400 font-medium">
                                            <span>Gasto: {formatCurrencyAbbrev(macro.spentValue)}</span>
                                            <span>Meta: {formatCurrencyAbbrev(macro.estimatedValue)}</span>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-6">
                                <i className="fa-solid fa-clipboard-list text-slate-600 text-3xl mb-2"></i>
                                <p className="text-slate-500 text-sm">Detalhamento por categorias não disponível.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3b) ONDE FOI O DINHEIRO — itens que mais gastaram (gasto por item, ranqueado).
                       "Por item" é recurso pago: só aparece se o DONO da obra tiver o plano com itens. */}
                {ownerEnt.canUseItens && (() => {
                    const byItem: Record<string, number> = {};
                    for (const e of expenses) {
                        const k = e.item_id || '__none__';
                        byItem[k] = (byItem[k] || 0) + (e.value || 0);
                    }
                    const rows = Object.entries(byItem).sort((a, b) => b[1] - a[1]);
                    if (rows.length === 0) return null;
                    const max = rows[0][1] || 1;
                    const top = rows.slice(0, 8);
                    return (
                        <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8">
                            <h2 className="text-lg font-bold text-white mb-1">
                                <i className="fa-solid fa-coins mr-2 text-amber-400"></i>
                                Onde foi o dinheiro
                            </h2>
                            <p className="text-xs text-slate-500 mb-6">Itens que mais consumiram, do maior pro menor.</p>
                            <div className="space-y-4">
                                {top.map(([itemId, total]) => (
                                    <div key={itemId}>
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-slate-200 font-medium">{itemId === '__none__' ? 'Sem item' : (itemsById[itemId] || 'Item')}</span>
                                            <span className="text-white font-bold">{formatCurrencyAbbrev(total)}</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${(total / max) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {rows.length > top.length && (
                                <p className="text-[11px] text-slate-500 mt-4 text-center">+{rows.length - top.length} outros itens</p>
                            )}
                        </div>
                    );
                })()}

                {/* 4) CAIXA DA OBRA: Aportado - Gasto - Aquisição = Saldo em caixa.
                       O card de Aquisição só aparece quando o terreno/aquisição foi pago
                       PELA OBRA (saiu do caixa) — mesma regra do app (CashSummaryCards).
                       Sem ele, o sócio fazia Aportado - Gasto e não chegava no Saldo:
                       faltava justamente a aquisição, que o saldo desconta. Caso real:
                       OBRA MONTE CASTELO, R$ 215.000 pagos pela obra — a conta do link
                       fechava R$ 215.000 a mais. */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8">
                    <h2 className="text-lg font-bold text-white mb-6">
                        <i className="fa-solid fa-hand-holding-dollar mr-2 text-emerald-400"></i>
                        Caixa da Obra
                    </h2>
                    <div className={`grid ${finance.aquisicaoPaga > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 md:gap-4`}>
                        <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Aportado</p>
                            <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                <span className="text-emerald-400 font-black text-base md:text-xl leading-none">
                                    {formatCurrencyAbbrev(finance.aportadoTotal).replace('R$', '').trim()}
                                </span>
                            </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Gasto</p>
                            <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                <span className="text-rose-400 font-black text-base md:text-xl leading-none">
                                    {formatCurrencyAbbrev(finance.gasto).replace('R$', '').trim()}
                                </span>
                            </div>
                        </div>
                        {finance.aquisicaoPaga > 0 && (
                            <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                                <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Aquisição</p>
                                <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                    <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                    <span className="text-amber-400 font-black text-base md:text-xl leading-none">
                                        {formatCurrencyAbbrev(finance.aquisicaoPaga).replace('R$', '').trim()}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Saldo em caixa</p>
                            <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                <span className={`font-black text-base md:text-xl leading-none ${finance.saldoCaixa >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrencyAbbrev(finance.saldoCaixa).replace('R$', '').trim()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5) ACERTO DE APORTES (Meta · Aportou · Falta por sócio — fonte única do app).
                       Sem base pra calcular meta (sem % / sem casas com dono) → cai na lista
                       simples "Aportes por sócio" (nome + total), sem regressão. */}
                {options.aportes && (() => {
                    const acerto = computeAporteShares(project);
                    const aporteDinheiro = (id?: string) => (project.contributions || []).filter(c => c.investorId === id).reduce((s, c) => s + (c.value || 0), 0);
                    const aporteViaDespesa = (id?: string) => (project.expenses || []).filter(e => e.paidByInvestorId === id).reduce((s, e) => s + (e.value || 0), 0);

                    // Fallback: sem base de meta → só lista quem aportou (comportamento antigo).
                    if (acerto.semBase) {
                        const linhas = (project.investors || [])
                            .map(inv => ({ name: inv.name, total: aporteDinheiro(inv.id) + aporteViaDespesa(inv.id) }))
                            .filter(l => l.total > 0)
                            .sort((a, b) => b.total - a.total);
                        if (linhas.length === 0) return null;
                        const totalGeral = linhas.reduce((s, l) => s + l.total, 0);
                        return (
                            <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8">
                                <h2 className="text-lg font-bold text-white mb-6">
                                    <i className="fa-solid fa-users mr-2 text-fuchsia-400"></i>
                                    Aportes por sócio
                                </h2>
                                <div className="space-y-1">
                                    {linhas.map((l, i) => (
                                        <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-700/60">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 text-fuchsia-400 flex items-center justify-center shrink-0">
                                                    <i className="fa-solid fa-user"></i>
                                                </div>
                                                <span className="text-white font-bold truncate">{l.name}</span>
                                            </div>
                                            <span className="text-emerald-400 font-black whitespace-nowrap">{formatCurrency(l.total)}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between pt-3 mt-1">
                                        <span className="text-slate-400 text-xs font-black uppercase tracking-widest">Total aportado</span>
                                        <span className="text-white font-black text-lg whitespace-nowrap">{formatCurrency(totalGeral)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // Falta: >0 precisa pôr (âmbar); <0 adiantou (verde); ~0 em dia.
                    const faltaTone = (v: number) => (v > 0.5 ? 'text-amber-400' : v < -0.5 ? 'text-emerald-400' : 'text-slate-500');
                    const faltaLabel = (v: number) => (v > 0.5 ? formatCurrency(v) : v < -0.5 ? `+${formatCurrency(-v)}` : 'Em dia');
                    const shares = [...acerto.shares].sort((a, b) => b.meta - a.meta);
                    const donoUnidades = (id?: string) => (project.units || []).filter(u => u.ownerInvestorId === id).map(u => u.identifier).join(', ');
                    const pctDe = (id?: string) => (project.profitShares || []).find(s => s.investorId === id)?.percentage;

                    return (
                        <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8">
                            <div className="flex items-center justify-between gap-2 mb-6">
                                <h2 className="text-lg font-bold text-white">
                                    <i className="fa-solid fa-scale-unbalanced mr-2 text-fuchsia-400"></i>
                                    Acerto de aportes
                                </h2>
                                <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">
                                    {acerto.mode === 'unit' ? 'Divisão por casa' : 'Divisão por porcentagem'}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {shares.map((s, i) => (
                                    <div key={i} className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-4">
                                        <div className="min-w-0 mb-3">
                                            <p className="text-white font-black truncate">{s.name}</p>
                                            <p className="text-[11px] text-slate-500 font-bold truncate">
                                                {acerto.mode === 'unit'
                                                    ? <><i className="fa-solid fa-house mr-1 text-fuchsia-400"></i>{donoUnidades(s.investorId)}</>
                                                    : <>{pctDe(s.investorId) ?? 0}%</>}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Meta</p>
                                                <p className="text-sm font-black text-slate-200">{formatCurrency(s.meta)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Aportou</p>
                                                <p className="text-sm font-black text-emerald-400">{formatCurrency(s.aportado)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Falta</p>
                                                <p className={`text-sm font-black ${faltaTone(s.falta)}`}>{faltaLabel(s.falta)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between pt-4 mt-1">
                                <span className="text-slate-400 text-xs font-black uppercase tracking-widest">Total aportado</span>
                                <span className="text-white font-black text-lg whitespace-nowrap">{formatCurrency(acerto.totalAportado)}</span>
                            </div>
                            {acerto.totalFalta > 0.5 && (
                                <p className="text-[11px] text-amber-400 font-bold mt-2 text-center">
                                    <i className="fa-solid fa-circle-arrow-up mr-1"></i>
                                    Falta aportar no total: {formatCurrency(acerto.totalFalta)}
                                </p>
                            )}
                        </div>
                    );
                })()}

                {/* 6) RESULTADO DO EMPREENDIMENTO — MESMO componente do app */}
                {options.resultado && <ResultadoEmpreendimento project={project} />}

                {/* 7) EXTRATO DE DESPESAS (com "Pago por") */}
                {options.despesas && project.expenses.length > 0 && (
                    <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-6 md:p-8 border border-slate-700 mb-8 overflow-hidden">
                        <h2 className="text-lg font-bold text-white mb-6">
                            <i className="fa-solid fa-receipt mr-2 text-slate-400"></i>
                            Extrato de Despesas
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="pb-3 pl-4">Data</th>
                                        <th className="pb-3">Descrição</th>
                                        <th className="pb-3">Pago por</th>
                                        <th className="pb-3 text-center">Anexo</th>
                                        <th className="pb-3 text-right pr-4">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {[...project.expenses]
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                        .map(exp => {
                                            // Normalizar lista de anexos (legacy + new array)
                                            const allAttachments = [
                                                ...(exp.attachmentUrl ? [exp.attachmentUrl] : []),
                                                ...(exp.attachments || [])
                                            ];
                                            const pagador = investorName(exp.paidByInvestorId) || 'Caixa da obra';

                                            return (
                                                <tr key={exp.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                                                    <td className="py-4 pl-4 text-slate-400 whitespace-nowrap">
                                                        {new Date(exp.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                    </td>
                                                    <td className="py-4 text-white font-medium">{exp.description}</td>
                                                    <td className="py-4 text-slate-300">
                                                        {exp.paidByInvestorId
                                                            ? <span className="text-fuchsia-300">{pagador}</span>
                                                            : <span className="text-slate-400">{pagador}</span>}
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        <div className="flex gap-2 justify-center">
                                                            {allAttachments.map((att, idx) => (
                                                                <span key={idx}>
                                                                    <FileLink path={att} />
                                                                </span>
                                                            ))}
                                                            {allAttachments.length === 0 && (
                                                                <span className="text-slate-600 opacity-30 px-2">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-right pr-4 text-slate-200 font-bold whitespace-nowrap">
                                                        {formatCurrency(exp.value)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Footer. No Free o relatório leva a marca (e ela é o convite:
                    quem recebe o link é justamente quem pode virar cliente).
                    No plano ObraPro o relatório é do construtor — sem marca. */}
                <footer className="text-center text-slate-500 text-sm space-y-4">
                    {!ownerEnt.canRemoveBranding && (
                        <a
                            href="https://obrapro.com.br"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-2xl hover:border-slate-500 transition-colors"
                        >
                            <i className="fa-solid fa-helmet-safety text-blue-400"></i>
                            <span className="text-xs text-slate-400">
                                Feito com <b className="text-white">ObraPro</b> — controle financeiro de obra
                            </span>
                        </a>
                    )}
                    <p>
                        <i className="fa-solid fa-shield-halved mr-1"></i>
                        Visualização segura • {new Date().getFullYear()}
                    </p>
                </footer>
            </div>
        </div>

    );
};

export default InvestorView;
