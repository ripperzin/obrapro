import React, { useEffect, useState } from 'react';
import { Project, STAGE_NAMES, STAGE_ICONS, ProgressStage } from '../types';
import { supabase } from '../supabaseClient';
import StageThumbnail from './StageThumbnail';

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

// Calculate months between two dates
const calculateMonthsBetween = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
};

const InvestorView: React.FC<InvestorViewProps> = ({ projectId }) => {
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [expandedMacroId, setExpandedMacroId] = useState<string | null>(null);

    useEffect(() => {
        const fetchProject = async () => {
            try {
                // Validate projectId format (UUID)
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!projectId || !uuidRegex.test(projectId)) {
                    throw new Error(`ID de projeto inválido: ${projectId}`);
                }

                // Fetch project data - using maybeSingle to avoid "Cannot coerce" error
                const { data: projectData, error: projectError } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('id', projectId)
                    .maybeSingle();

                if (projectError) throw projectError;
                if (!projectData) throw new Error('Projeto não encontrado no banco de dados');

                // Fetch units
                const { data: unitsData } = await supabase
                    .from('units')
                    .select('*')
                    .eq('project_id', projectId);

                // Fetch stage evidences
                const { data: evidenceData } = await supabase
                    .from('stage_evidences')
                    .select('*')
                    .eq('project_id', projectId);

                // Fetch expenses for financial health
                const { data: expensesData } = await supabase
                    .from('expenses')
                    .select('*')
                    .eq('project_id', projectId);

                // Fetch budget data
                const { data: budgetData } = await supabase
                    .from('project_budgets')
                    .select('*')
                    .eq('project_id', projectId)
                    .maybeSingle();

                let macrosData: any[] = [];
                let subMacrosData: any[] = [];

                if (budgetData) {
                    const { data: macros } = await supabase
                        .from('project_macros')
                        .select('*')
                        .eq('budget_id', budgetData.id)
                        .order('display_order');
                    macrosData = macros || [];

                    // Fetch submacros if there are macros
                    const macroIds = macrosData.map((m: any) => m.id);
                    if (macroIds.length > 0) {
                        const { data: subs } = await supabase
                            .from('project_sub_macros')
                            .select('*')
                            .in('project_macro_id', macroIds)
                            .order('display_order');
                        subMacrosData = subs || [];
                    }
                }

                setExpenses(expensesData || []);

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
                    units: (unitsData || []).map((u: any) => ({
                        id: u.id,
                        identifier: u.identifier,
                        area: u.area,
                        cost: u.cost,
                        status: u.status,
                        valorEstimadoVenda: u.valor_estimado_venda,
                        saleValue: u.sale_value,
                        saleDate: u.sale_date
                    })),
                    expenses: (expensesData || []).map((e: any) => ({
                        id: e.id,
                        description: e.description,
                        value: e.value,
                        date: e.date,
                        userId: e.user_id,
                        userName: e.user_name,
                        attachmentUrl: e.attachment_url,
                        attachments: e.attachments || []
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
                            pentValue: m.spent_value || 0,
                            spentValue: m.spent_value || 0,
                            displayOrder: m.display_order,
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

    // Calculate financial metrics
    const calculateMetrics = () => {
        if (!project) return {
            totalUnits: 0,
            soldUnits: 0,
            availableUnits: 0,
            totalCost: 0,
            totalExpenses: 0,
            budgetUsage: null,
            potentialSales: null,
            averageMargin: null,
            monthlyMargin: null,
            totalSold: 0
        };

        const soldUnits = project.units.filter(u => u.status === 'Sold');
        const availableUnits = project.units.filter(u => u.status === 'Available');
        const totalCost = project.units.reduce((sum, u) => sum + u.cost, 0);
        const totalExpenses = project.expenses.reduce((sum, e) => sum + e.value, 0);
        const budgetUsage = totalCost > 0 ? (totalExpenses / totalCost) * 100 : null;
        const totalSold = soldUnits.reduce((sum, u) => sum + (u.saleValue || 0), 0);

        // Potencial de venda (soma dos valorEstimadoVenda das unidades disponíveis)
        const potentialSales = availableUnits.reduce((sum, u) => sum + (u.valorEstimadoVenda || 0), 0);

        // Margem média (ROI médio das unidades vendidas)
        let averageMargin: number | null = null;
        let monthlyMargin: number | null = null;

        if (soldUnits.length > 0) {
            const isCompleted = project.progress === 100;
            const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);

            let totalRoi = 0;
            let totalMonthlyRoi = 0;
            let validCount = 0;

            const firstExpenseDate = project.expenses.length > 0
                ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date)
                : null;

            soldUnits.forEach(unit => {
                if (unit.saleValue && unit.saleValue > 0) {
                    // Calculate real cost based on area proportion if completed
                    const realCost = (isCompleted && totalUnitsArea > 0)
                        ? (unit.area / totalUnitsArea) * totalExpenses
                        : unit.cost;
                    const costBase = realCost > 0 ? realCost : unit.cost;

                    if (costBase > 0) {
                        const roi = (unit.saleValue - costBase) / costBase;
                        totalRoi += roi;

                        // Monthly ROI calculation
                        if (unit.saleDate && firstExpenseDate) {
                            const months = calculateMonthsBetween(firstExpenseDate, unit.saleDate);
                            const roiMensal = months > 0 ? roi / months : 0;
                            totalMonthlyRoi += roiMensal;
                        }

                        validCount++;
                    }
                }
            });

            if (validCount > 0) {
                averageMargin = (totalRoi / validCount) * 100;
                monthlyMargin = (totalMonthlyRoi / validCount) * 100;
            }
        }

        return {
            totalUnits: project.units.length,
            soldUnits: soldUnits.length,
            availableUnits: availableUnits.length,
            totalCost,
            totalExpenses,
            budgetUsage,
            potentialSales: potentialSales > 0 ? potentialSales : null,
            averageMargin,
            monthlyMargin,
            totalSold
        };
    };

    const metrics = calculateMetrics();

    // Get all stages
    const allStages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    // Helper to display value or "--"
    const displayValue = (value: number | null, formatter: (v: number) => string, suffix: string = ''): string => {
        if (value === null || value === undefined || isNaN(value)) return '--';
        if (value < 0) return '--';
        return formatter(value) + suffix;
    };

    // Componente auxiliar para link com assinatura
    const FileLink = ({ path }: { path: string }) => {
        const [url, setUrl] = useState<string | null>(null);

        useEffect(() => {
            if (!path) return;
            if (path.startsWith('http')) {
                setUrl(path);
                return;
            }
            // Tenta criar URL assinada, mas considera se usuário é anonimo ou não.
            // Para portal do investidor (anon), createSignedUrl pode falhar se não tiver regra.
            // Mas assumindo que o app já usa isso...
            const getUrl = async () => {
                const { data } = await supabase.storage
                    .from('expense-attachments')
                    .createSignedUrl(path, 3600);

                if (data?.signedUrl) {
                    setUrl(data.signedUrl);
                } else {
                    // Fallback
                    const { data: d2 } = await supabase.storage
                        .from('project-documents')
                        .createSignedUrl(path, 3600);
                    if (d2?.signedUrl) setUrl(d2.signedUrl);
                }
            };
            getUrl();
        }, [path]);

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
                    <p className="text-slate-400 mb-8">
                        {project.startDate && `Início: ${new Date(project.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                        {project.startDate && project.deliveryDate && ' • '}
                        {project.deliveryDate && `Entrega: ${new Date(project.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                    </p>

                    {(() => {
                        // Find latest photo from stage evidence
                        const currentStageEvidence = (project.stageEvidence || [])
                            .filter(e => e.photos && e.photos.length > 0)
                            .sort((a, b) => b.stage - a.stage)[0];

                        const photo = currentStageEvidence?.photos?.[0];

                        if (photo) {
                            return (
                                <div className="max-w-2xl mx-auto">
                                    <div className="rounded-3xl p-2 bg-slate-800/50 backdrop-blur border border-slate-700 shadow-2xl">
                                        <div className="rounded-2xl overflow-hidden aspect-video relative group">
                                            <StageThumbnail photoPath={photo} className="w-full h-full" />
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex justify-between items-end">
                                                <div>
                                                    <p className="text-white font-bold text-lg">{STAGE_NAMES[currentStageEvidence.stage]}</p>
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

                {/* Progress Card */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-white">Progresso Geral</h2>
                        <span className="text-3xl font-black text-blue-400">{project.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-1000"
                            style={{ width: `${project.progress}%` }}
                        />
                    </div>
                    <p className="text-slate-400 mt-3 text-sm">
                        <i className="fa-solid fa-location-dot mr-2"></i>
                        Etapa atual: <span className="text-white font-medium">{STAGE_NAMES[project.progress]}</span>
                    </p>
                </div>

                {/* Financial Metrics - Sales */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700 text-center">
                        <i className="fa-solid fa-building text-2xl text-blue-400 mb-3"></i>
                        <p className="text-2xl font-black text-white">{metrics.totalUnits}</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Unidades</p>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700 text-center">
                        <i className="fa-solid fa-check-circle text-2xl text-green-400 mb-3"></i>
                        <p className="text-2xl font-black text-white">{metrics.soldUnits}</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Vendidas</p>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700 text-center">
                        <i className="fa-solid fa-tag text-2xl text-cyan-400 mb-3"></i>
                        <p className="text-2xl font-black text-white">{metrics.availableUnits}</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">À Venda</p>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700 text-center">
                        <i className="fa-solid fa-coins text-2xl text-amber-400 mb-3"></i>
                        <p className="text-2xl font-black text-white">
                            {metrics.totalSold > 0 ? formatCurrencyAbbrev(metrics.totalSold) : '--'}
                        </p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Total Vendido</p>
                    </div>
                </div>

                {/* Financial Health Card */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8">
                    <h2 className="text-lg font-bold text-white mb-6">
                        <i className="fa-solid fa-heartbeat mr-2 text-red-400"></i>
                        Saúde Financeira
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Margem Média */}
                        <div className="bg-green-500/10 rounded-2xl p-4 border border-green-500/30 text-center">
                            <i className="fa-solid fa-chart-line text-xl text-green-400 mb-2"></i>
                            <p className="text-2xl font-black text-green-400">
                                {displayValue(metrics.averageMargin, v => v.toFixed(1), '%')}
                            </p>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Margem Média</p>
                        </div>

                        {/* Margem Mensal */}
                        <div className="bg-purple-500/10 rounded-2xl p-4 border border-purple-500/30 text-center">
                            <i className="fa-solid fa-calendar-check text-xl text-purple-400 mb-2"></i>
                            <p className="text-2xl font-black text-purple-400">
                                {displayValue(metrics.monthlyMargin, v => v.toFixed(1), '%')}
                            </p>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Margem Mensal</p>
                        </div>

                        {/* Potencial */}
                        <div className="bg-orange-500/10 rounded-2xl p-4 border border-orange-500/30 text-center">
                            <i className="fa-solid fa-gem text-xl text-orange-400 mb-2"></i>
                            <p className="text-2xl font-black text-orange-400">
                                {displayValue(metrics.potentialSales, formatCurrencyAbbrev)}
                            </p>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Potencial</p>
                        </div>

                        {/* Execução Orçamento */}
                        <div className="bg-blue-500/10 rounded-2xl p-4 border border-blue-500/30 text-center">
                            <i className="fa-solid fa-wallet text-xl text-blue-400 mb-2"></i>
                            <p className="text-2xl font-black text-blue-400">
                                {displayValue(metrics.budgetUsage, v => v.toFixed(0), '%')}
                            </p>
                            <p className="text-xs text-slate-400 uppercase tracking-wider">Orçamento</p>
                        </div>
                    </div>
                </div>

                {/* --- BUDGET CONTROL VISUAL (Replicated from BudgetSection.tsx) --- */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8" style={{ minHeight: '200px' }}>
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-lg font-bold text-white">
                            <i className="fa-solid fa-scale-balanced mr-2 text-green-400"></i>
                            Controle de Orçamento
                        </h2>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${metrics.budgetUsage && metrics.budgetUsage > 100
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-green-500/20 text-green-400 border-green-500/30'
                            }`}>
                            {metrics.budgetUsage ? metrics.budgetUsage.toFixed(0) : 0}% utilizado
                        </div>
                    </div>

                    {/* Top Stats */}
                    <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
                        <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Orçamento</p>
                            <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                <span className="text-white font-black text-base md:text-xl leading-none">
                                    {formatCurrencyAbbrev(metrics.totalCost).replace('R$', '').trim()}
                                </span>
                            </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Gasto</p>
                            <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                <span className="text-blue-400 font-black text-base md:text-xl leading-none">
                                    {formatCurrencyAbbrev(metrics.totalExpenses).replace('R$', '').trim()}
                                </span>
                            </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-2 md:p-4 text-center">
                            <p className="text-slate-400 text-[9px] md:text-xs uppercase tracking-widest mb-1">Saldo</p>
                            <div className="flex items-baseline justify-center gap-0.5 whitespace-nowrap">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500">R$</span>
                                <span className={`font-black text-base md:text-xl leading-none ${metrics.totalCost - metrics.totalExpenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatCurrencyAbbrev(metrics.totalCost - metrics.totalExpenses).replace('R$', '').trim()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Main Progress Bar */}
                    <div className="w-full bg-slate-900 rounded-full h-4 mb-10 border border-slate-700 relative overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${metrics.budgetUsage && metrics.budgetUsage > 100
                                ? 'bg-red-500'
                                : 'bg-green-500' // Using consistent simple colors to match BudgetSection
                                }`}
                            style={{ width: `${Math.min(metrics.budgetUsage || 0, 100)}%` }}
                        ></div>
                    </div>

                    {/* Categories List */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-700 pb-2">Por Categoria</h3>

                        {project.budget && project.budget.macros && project.budget.macros.length > 0 ? (
                            project.budget.macros.sort((a, b) => a.displayOrder - b.displayOrder).map(macro => {
                                const percent = macro.estimatedValue > 0 ? (macro.spentValue / macro.estimatedValue) * 100 : 0;
                                const isOver = percent > 100;

                                return (
                                    <div key={macro.id} className="glass rounded-2xl p-4 transition-all hover:bg-slate-800/30 cursor-pointer" onClick={() => setExpandedMacroId(expandedMacroId === macro.id ? null : macro.id)}>
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <i className={`fa-solid fa-chevron-${expandedMacroId === macro.id ? 'down' : 'right'} text-xs text-slate-500`}></i>
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

                                        {/* Submacros */}
                                        {expandedMacroId === macro.id && (
                                            <div className="mt-4 pl-4 border-l-2 border-slate-700 space-y-3 animate-fade-in">
                                                {macro.subMacros && macro.subMacros.length > 0 ? (
                                                    macro.subMacros.sort((a: any, b: any) => a.displayOrder - b.displayOrder).map((sub: any) => {
                                                        const subProgress = sub.estimatedValue > 0 ? (sub.spentValue / sub.estimatedValue) * 100 : 0;
                                                        return (
                                                            <div key={sub.id} className="text-xs">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="text-slate-300 font-bold">{sub.name}</span>
                                                                    <span className={`${subProgress > 100 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                        {formatCurrencyAbbrev(sub.spentValue)} / {formatCurrencyAbbrev(sub.estimatedValue)}
                                                                    </span>
                                                                </div>
                                                                <div className="w-full h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${subProgress > 100 ? 'bg-red-500' : 'bg-blue-400'}`}
                                                                        style={{ width: `${Math.min(subProgress, 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <p className="text-xs text-slate-600 italic">Nenhum detalhe disponível.</p>
                                                )}
                                            </div>
                                        )}
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

                {/* --- EXPENSES TABLE --- */}
                {project.expenses.length > 0 && (
                    <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8 overflow-hidden">
                        <h2 className="text-lg font-bold text-white mb-6">
                            <i className="fa-solid fa-receipt mr-2 text-slate-400"></i>
                            Extrato Completo de Despesas
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="pb-3 pl-4">Data</th>
                                        <th className="pb-3">Descrição</th>
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

                                            return (
                                                <tr key={exp.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                                                    <td className="py-4 pl-4 text-slate-400">
                                                        {new Date(exp.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                    </td>
                                                    <td className="py-4 text-white font-medium">{exp.description}</td>
                                                    <td className="py-4 text-center">
                                                        <div className="flex gap-2 justify-center">
                                                            {allAttachments.map((att, idx) => (
                                                                <FileLink key={idx} path={att} />
                                                            ))}
                                                            {allAttachments.length === 0 && (
                                                                <span className="text-slate-600 opacity-30 px-2">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 text-right pr-4 text-slate-200 font-bold">
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

                {/* Timeline Visual */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8">
                    <h2 className="text-lg font-bold text-white mb-6">
                        <i className="fa-solid fa-diagram-project mr-2 text-blue-400"></i>
                        Cronograma de Etapas
                    </h2>

                    <div className="relative">
                        {/* Progress Line */}
                        <div className="absolute left-6 top-0 bottom-0 w-1 bg-slate-700">
                            <div
                                className="w-full bg-gradient-to-b from-blue-500 to-cyan-400 transition-all duration-1000"
                                style={{ height: `${(project.progress / 100) * 100}%` }}
                            />
                        </div>

                        {/* Stages */}
                        <div className="space-y-6">
                            {allStages.map((stage) => {
                                const evidence = project.stageEvidence?.find(e => e.stage === stage);
                                const isCompleted = project.progress >= stage;
                                const isCurrent = project.progress === stage;
                                const photo = evidence?.photos?.[0];

                                return (
                                    <div key={stage} className="relative flex items-start gap-4 pl-12">
                                        {/* Stage Dot */}
                                        <div
                                            className={`absolute left-4 w-5 h-5 rounded-full border-2 transition-all ${isCompleted
                                                ? 'bg-blue-500 border-blue-400'
                                                : 'bg-slate-800 border-slate-600'
                                                } ${isCurrent ? 'ring-4 ring-blue-500/30 scale-125' : ''}`}
                                        >
                                            {isCompleted && (
                                                <i className="fa-solid fa-check text-[8px] text-white absolute inset-0 flex items-center justify-center"></i>
                                            )}
                                        </div>

                                        {/* Content */}
                                        <div className={`flex-1 ${!isCompleted ? 'opacity-50' : ''}`}>
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCompleted ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-500'
                                                    }`}>
                                                    <i className={`fa-solid ${STAGE_ICONS[stage]} text-sm`}></i>
                                                </div>
                                                <div>
                                                    <h3 className={`font-bold ${isCompleted ? 'text-white' : 'text-slate-500'}`}>
                                                        {STAGE_NAMES[stage]}
                                                    </h3>
                                                    {evidence?.date && (
                                                        <p className="text-xs text-slate-400">
                                                            {new Date(evidence.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Photo Evidence */}
                                            {photo && (
                                                <div className="mt-3 rounded-xl overflow-hidden border border-slate-600 w-32 h-24">
                                                    <StageThumbnail photoPath={photo} className="w-full h-full" />
                                                </div>
                                            )}

                                            {evidence?.notes && (
                                                <p className="text-sm text-slate-400 mt-2">{evidence.notes}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="text-center text-slate-500 text-sm">
                    <p>
                        <i className="fa-solid fa-shield-halved mr-1"></i>
                        Visualização segura • Obra Pro © {new Date().getFullYear()}
                    </p>
                </footer>
            </div>
        </div>

    );
};

export default InvestorView;
