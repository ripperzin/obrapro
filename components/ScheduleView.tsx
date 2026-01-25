
import React, { useMemo } from 'react';
import { Project, ProjectMacro } from '../types';
import { formatCurrency, formatCurrencyAbbrev } from '../utils';
import SCurveChart from './SCurveChart';

interface ScheduleViewProps {
    project: Project;
    onClose: () => void;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({ project, onClose }) => {
    // 1. Determine the effective time range (Macro Boundaries ONLY)
    const effectiveDates = useMemo(() => {
        let startStr = null;
        let endStr = null;

        if (project.budget?.macros) {
            const starts = project.budget.macros
                .map(m => m.plannedStartDate)
                .filter(d => d && d.length >= 10 && d !== '1970-01-01') as string[];
            const ends = project.budget.macros
                .map(m => m.plannedEndDate)
                .filter(d => d && d.length >= 10 && d !== '1970-01-01') as string[];

            if (starts.length > 0) {
                startStr = starts.reduce((a, b) => a < b ? a : b);
            }
            if (ends.length > 0) {
                endStr = ends.reduce((a, b) => a > b ? a : b);
            }
        }

        return { start: startStr, end: endStr };
    }, [project.budget?.macros]);

    const months = useMemo(() => {
        const { start: startStr, end: endStr } = effectiveDates;
        if (!startStr || !endStr) return [];

        const start = new Date(startStr);
        const end = new Date(endStr);
        const today = new Date();
        const maxDate = new Date(Math.max(end.getTime(), today.getTime()));

        const list: { date: Date, label: string }[] = [];
        let current = new Date(start.getFullYear(), start.getMonth(), 1);
        const limit = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

        // Loop up to limit
        while (current < limit) {
            list.push({
                date: new Date(current),
                label: current.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
            });
            current.setMonth(current.getMonth() + 1);
            if (list.length > 120) break; // Safety break (10 years)
        }
        return list;
    }, [effectiveDates]);

    // 2. Calculate distribution per macro per month
    const scheduleData = useMemo(() => {
        if (!project.budget?.macros || months.length === 0) return [];

        return project.budget.macros.map(macro => {
            const monthlyValues = months.map(month => {
                let planned = 0;

                const mStart = macro.plannedStartDate ? new Date(macro.plannedStartDate) : (effectiveDates.start ? new Date(effectiveDates.start) : null);
                const mEnd = macro.plannedEndDate ? new Date(macro.plannedEndDate) : (effectiveDates.end ? new Date(effectiveDates.end) : null);

                if (mStart && mEnd) {
                    const startCompare = new Date(mStart.getFullYear(), mStart.getMonth(), 1);
                    const endCompare = new Date(mEnd.getFullYear(), mEnd.getMonth(), 1);

                    if (month.date >= startCompare && month.date <= endCompare) {
                        let duration = (mEnd.getFullYear() - mStart.getFullYear()) * 12;
                        duration = duration - mStart.getMonth() + mEnd.getMonth() + 1;
                        duration = duration <= 0 ? 1 : duration;
                        planned = macro.estimatedValue / duration;
                    }
                }
                return planned;
            });

            return {
                macro,
                monthlyValues
            };
        });
    }, [project, months]);

    const totalPerMonth = useMemo(() => {
        return months.map((_, index) => {
            return scheduleData.reduce((sum, item) => sum + item.monthlyValues[index], 0);
        });
    }, [scheduleData, months]);

    if (!effectiveDates.start || !effectiveDates.end) {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                <div className="glass p-8 rounded-3xl max-w-md text-center">
                    <i className="fa-solid fa-calendar-xmark text-4xl text-blue-400 mb-4"></i>
                    <h2 className="text-xl font-black text-white mb-2">Cronograma não Gerado</h2>
                    <p className="text-slate-400 mb-6">Para visualizar o cronograma, você precisa definir as datas de <strong>Início</strong> e <strong>Fim</strong> dentro das categorias no Orçamento.</p>
                    <button onClick={onClose} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">Entendido</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xl z-[100] flex flex-col animate-fade-in">
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                        <i className="fa-solid fa-calendar-days text-blue-400"></i>
                        Cronograma Físico-Financeiro
                    </h2>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">{project.name}</p>
                </div>
                <button
                    onClick={onClose}
                    className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-full text-white hover:bg-red-500/20 hover:text-red-400 transition-all"
                >
                    <i className="fa-solid fa-xmark text-xl"></i>
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* S-Curve Overview */}
                <div className="glass p-4 md:p-8 rounded-3xl border border-white/5">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h3 className="text-lg font-black text-white uppercase">
                                <span className="md:hidden">Progresso</span>
                                <span className="hidden md:inline">Acompanhamento de Progresso</span>
                            </h3>
                            <p className="text-slate-500 text-xs font-bold uppercase">
                                <span className="md:hidden">Planejado x Realizado</span>
                                <span className="hidden md:inline">Curva S (Planejado vs Realizado)</span>
                            </p>
                        </div>
                        <div className="flex gap-6">
                            {/* Investimento Total removed */}
                        </div>
                    </div>
                    <SCurveChart projects={[project]} />
                </div>

                {/* Detailed Table */}
                <div className="glass rounded-3xl border border-white/5 overflow-hidden">
                    <div className="p-6 border-b border-white/10 flex justify-between items-center">
                        <h3 className="text-lg font-black text-white uppercase">Detalhamento Mensal</h3>
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-black uppercase">Valores Planejados</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="px-6 py-4 sticky left-0 bg-slate-900 z-10 w-64 shadow-[2px_0_10px_rgba(0,0,0,0.3)]">Categoria</th>
                                    {months.map(m => (
                                        <th key={m.label} className="px-6 py-4 min-w-[120px] text-center">{m.label}</th>
                                    ))}
                                    <th className="px-6 py-4 text-right bg-white/5">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {scheduleData.map((item, idx) => (
                                    <tr key={item.macro.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-4 sticky left-0 bg-slate-900 z-10 font-bold text-white text-sm shadow-[2px_0_10px_rgba(0,0,0,0.3)]">
                                            {item.macro.name}
                                        </td>
                                        {item.monthlyValues.map((val, midx) => (
                                            <td key={midx} className="px-6 py-4 text-center text-xs font-medium text-slate-400">
                                                {val > 0 ? formatCurrencyAbbrev(val) : <span className="opacity-20">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-6 py-4 text-right font-black text-blue-400 text-xs bg-white/5">
                                            {formatCurrencyAbbrev(item.macro.estimatedValue)}
                                        </td>
                                    </tr>
                                ))}
                                {/* Totais Row */}
                                <tr className="bg-blue-600/5 font-black">
                                    <td className="px-6 py-6 sticky left-0 bg-slate-900 z-10 uppercase text-blue-400 text-[10px] tracking-widest shadow-[2px_0_10px_rgba(0,0,0,0.3)]">
                                        Investimento Mensal
                                    </td>
                                    {totalPerMonth.map((val, idx) => (
                                        <td key={idx} className="px-6 py-6 text-center text-blue-400 text-sm">
                                            {formatCurrencyAbbrev(val)}
                                        </td>
                                    ))}
                                    <td className="px-6 py-6 text-right text-blue-400 text-sm bg-blue-600/10">
                                        {formatCurrencyAbbrev(project.expectedTotalCost)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Footer / Legend */}
            <div className="p-6 border-t border-white/10 bg-slate-900/80 flex items-center gap-8">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-[10px] font-black text-slate-400 uppercase">Valores Proporcionais às Datas de cada Etapa</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium italic">
                    * Os valores acima são planejados. O acompanhamento real é feito na aba de Despesas.
                </p>
            </div>
        </div>
    );
};

export default ScheduleView;
