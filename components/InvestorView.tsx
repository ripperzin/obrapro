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
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
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

    useEffect(() => {
        const fetchProject = async () => {
            try {
                // Fetch project data
                const { data: projectData, error: projectError } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('id', projectId)
                    .single();

                if (projectError) throw projectError;

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
                        userName: e.user_name
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
                    }))
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

    // Calculate S-Curve data with budget comparison
    const calculateSCurve = () => {
        if (!project) return { stages: [], budgetData: [] };

        // Progress curve
        const stages = allStages.map((stage, index) => {
            const evidence = project.stageEvidence?.find(e => e.stage === stage);
            const isCompleted = project.progress >= stage;
            return {
                stage,
                name: STAGE_NAMES[stage],
                completed: isCompleted,
                date: evidence?.date || null,
                percentComplete: stage
            };
        });

        // Budget execution curve (simplified - based on expenses over time)
        const totalBudget = metrics.totalCost || 1;
        const budgetPercent = metrics.totalCost > 0
            ? Math.min((metrics.totalExpenses / metrics.totalCost) * 100, 100)
            : 0;

        return { stages, budgetPercent, progressPercent: project.progress };
    };

    const sCurveData = calculateSCurve();

    // Helper to display value or "--"
    const displayValue = (value: number | null, formatter: (v: number) => string, suffix: string = ''): string => {
        if (value === null || value === undefined || isNaN(value)) return '--';
        if (value < 0) return '--';
        return formatter(value) + suffix;
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
                    <p className="text-slate-400">
                        {project.startDate && `Início: ${new Date(project.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                        {project.startDate && project.deliveryDate && ' • '}
                        {project.deliveryDate && `Entrega: ${new Date(project.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                    </p>
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

                    {/* Budget Progress Bar */}
                    {metrics.budgetUsage !== null && (
                        <div className="mt-6">
                            <div className="flex justify-between text-sm text-slate-400 mb-2">
                                <span>Execução do Orçamento</span>
                                <span>{metrics.budgetUsage.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ${metrics.budgetUsage > 100
                                        ? 'bg-gradient-to-r from-red-500 to-orange-500'
                                        : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                                        }`}
                                    style={{ width: `${Math.min(metrics.budgetUsage, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>Realizado: {formatCurrencyAbbrev(metrics.totalExpenses)}</span>
                                <span>Orçamento: {formatCurrencyAbbrev(metrics.totalCost)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* S-Curve Chart - Progress vs Budget */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8">
                    <h2 className="text-lg font-bold text-white mb-6">
                        <i className="fa-solid fa-chart-area mr-2 text-blue-400"></i>
                        Curva S - Progresso vs Orçamento
                    </h2>

                    <div className="relative h-56">
                        {/* Grid Lines */}
                        <div className="absolute inset-0 ml-10">
                            {[0, 25, 50, 75, 100].map(percent => (
                                <div
                                    key={percent}
                                    className="absolute w-full border-t border-slate-700/50"
                                    style={{ top: `${100 - percent}%` }}
                                >
                                    <span className="absolute -left-10 -top-2 text-xs text-slate-500 w-8 text-right">{percent}%</span>
                                </div>
                            ))}
                        </div>

                        {/* Chart Area */}
                        <div className="absolute inset-0 ml-10 mr-4">
                            {/* Planned diagonal line */}
                            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                                {/* Planned Line (diagonal) */}
                                <line
                                    x1="0"
                                    y1="100"
                                    x2="100"
                                    y2="0"
                                    stroke="#475569"
                                    strokeWidth="0.5"
                                    strokeDasharray="2"
                                />

                                {/* Progress Bar (horizontal at current progress) */}
                                <rect
                                    x="0"
                                    y={100 - project.progress}
                                    width={project.progress}
                                    height="2"
                                    fill="#3b82f6"
                                    rx="1"
                                />

                                {/* Progress Point */}
                                <circle
                                    cx={project.progress}
                                    cy={100 - project.progress}
                                    r="4"
                                    fill="#3b82f6"
                                    stroke="#1e293b"
                                    strokeWidth="2"
                                />

                                {/* Budget Bar (if different from progress) */}
                                {metrics.budgetUsage !== null && (
                                    <>
                                        <rect
                                            x="0"
                                            y={100 - Math.min(metrics.budgetUsage, 100)}
                                            width={Math.min(metrics.budgetUsage, 100)}
                                            height="2"
                                            fill="#10b981"
                                            rx="1"
                                        />
                                        <circle
                                            cx={Math.min(metrics.budgetUsage, 100)}
                                            cy={100 - Math.min(metrics.budgetUsage, 100)}
                                            r="4"
                                            fill="#10b981"
                                            stroke="#1e293b"
                                            strokeWidth="2"
                                        />
                                    </>
                                )}
                            </svg>

                            {/* Current Progress Indicator */}
                            <div
                                className="absolute flex flex-col items-center"
                                style={{
                                    left: `${project.progress}%`,
                                    top: `${100 - project.progress}%`,
                                    transform: 'translate(-50%, -100%)'
                                }}
                            >
                                <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded mb-1 whitespace-nowrap">
                                    Obra {project.progress}%
                                </div>
                            </div>

                            {/* Budget Indicator */}
                            {metrics.budgetUsage !== null && metrics.budgetUsage !== project.progress && (
                                <div
                                    className="absolute flex flex-col items-center"
                                    style={{
                                        left: `${Math.min(metrics.budgetUsage, 100)}%`,
                                        top: `${100 - Math.min(metrics.budgetUsage, 100)}%`,
                                        transform: 'translate(-50%, 10px)'
                                    }}
                                >
                                    <div className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                                        Custo {metrics.budgetUsage.toFixed(0)}%
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* X-axis labels */}
                        <div className="absolute bottom-0 left-10 right-4 flex justify-between text-xs text-slate-500">
                            <span>Início</span>
                            <span>50%</span>
                            <span>Conclusão</span>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex items-center justify-center gap-8 mt-6 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-1 bg-slate-500" style={{ borderStyle: 'dashed' }}></div>
                            <span className="text-slate-400">Planejado</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-1 bg-blue-500 rounded"></div>
                            <span className="text-slate-400">Progresso</span>
                        </div>
                        {metrics.budgetUsage !== null && (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-1 bg-green-500 rounded"></div>
                                <span className="text-slate-400">Orçamento</span>
                            </div>
                        )}
                    </div>
                </div>

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
