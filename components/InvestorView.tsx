import React, { useEffect, useState } from 'react';
import { Project, STAGE_NAMES, STAGE_ICONS, ProgressStage } from '../types';
import { supabase } from '../supabaseClient';
import StageThumbnail from './StageThumbnail';

interface InvestorViewProps {
    projectId: string;
}

const InvestorView: React.FC<InvestorViewProps> = ({ projectId }) => {
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                    expenses: [],
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
        if (!project) return { roi: 0, margin: 0, soldUnits: 0, totalUnits: 0 };

        const soldUnits = project.units.filter(u => u.status === 'Sold');
        const totalSales = soldUnits.reduce((sum, u) => sum + (u.saleValue || 0), 0);
        const totalCost = project.units.reduce((sum, u) => sum + u.cost, 0);
        const margin = totalCost > 0 ? ((totalSales - totalCost) / totalCost) * 100 : 0;

        return {
            roi: margin,
            margin: totalSales - totalCost,
            soldUnits: soldUnits.length,
            totalUnits: project.units.length
        };
    };

    const metrics = calculateMetrics();

    // Get all stages
    const allStages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    // Calculate S-Curve data
    const calculateSCurve = () => {
        if (!project) return [];

        const data = allStages.map(stage => {
            const evidence = project.stageEvidence?.find(e => e.stage === stage);
            const isCompleted = project.progress >= stage;
            return {
                stage,
                name: STAGE_NAMES[stage],
                completed: isCompleted,
                date: evidence?.date || null,
                plannedPercent: (stage / 100) * 100,
                actualPercent: isCompleted ? (stage / 100) * 100 : null
            };
        });

        return data;
    };

    const sCurveData = calculateSCurve();

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

                {/* Financial Metrics */}
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
                        <i className="fa-solid fa-chart-line text-2xl text-cyan-400 mb-3"></i>
                        <p className="text-2xl font-black text-white">{metrics.roi.toFixed(1)}%</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">ROI</p>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700 text-center">
                        <i className="fa-solid fa-coins text-2xl text-amber-400 mb-3"></i>
                        <p className="text-2xl font-black text-white">
                            R$ {(metrics.margin / 1000).toFixed(0)}k
                        </p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider">Margem</p>
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

                {/* S-Curve Chart (Simple Visual) */}
                <div className="bg-slate-800/50 backdrop-blur rounded-3xl p-8 border border-slate-700 mb-8">
                    <h2 className="text-lg font-bold text-white mb-6">
                        <i className="fa-solid fa-chart-area mr-2 text-blue-400"></i>
                        Curva S - Progresso vs Planejado
                    </h2>

                    <div className="relative h-48">
                        {/* Grid Lines */}
                        <div className="absolute inset-0">
                            {[0, 25, 50, 75, 100].map(percent => (
                                <div
                                    key={percent}
                                    className="absolute w-full border-t border-slate-700"
                                    style={{ top: `${100 - percent}%` }}
                                >
                                    <span className="absolute -left-8 -top-2 text-xs text-slate-500">{percent}%</span>
                                </div>
                            ))}
                        </div>

                        {/* Planned Line (diagonal) */}
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                            <line
                                x1="0"
                                y1="100%"
                                x2="100%"
                                y2="0"
                                stroke="#475569"
                                strokeWidth="2"
                                strokeDasharray="4"
                            />
                            {/* Actual Progress Line */}
                            <polyline
                                points={sCurveData
                                    .filter(d => d.completed)
                                    .map((d, i, arr) => {
                                        const x = (i / (arr.length - 1 || 1)) * 100;
                                        const y = 100 - (d.actualPercent || 0);
                                        return `${x}%,${y}%`;
                                    })
                                    .join(' ')}
                                fill="none"
                                stroke="#3b82f6"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>

                        {/* Labels */}
                        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-slate-500 pt-2">
                            <span>Início</span>
                            <span>Conclusão</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-8 mt-6 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-slate-500" style={{ borderStyle: 'dashed' }}></div>
                            <span className="text-slate-400">Planejado</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-1 bg-blue-500 rounded"></div>
                            <span className="text-slate-400">Realizado</span>
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
