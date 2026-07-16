import React from 'react';
import { Project } from '../types';
import { formatCurrency } from '../utils';

// Últimas movimentações (gastos + aportes) + "última atualização da obra".
// Reforça a prestação de contas permanente e o hábito de voltar toda semana.

interface Movement {
    key: string;
    kind: 'expense' | 'contribution';
    description: string;
    sublabel?: string;
    value: number;
    date: string;
}

const startOfDay = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00');

const daysAgo = (iso: string): number => {
    const d = startOfDay(iso).getTime();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((now.getTime() - d) / (1000 * 60 * 60 * 24));
};

const lastUpdatedLabel = (days: number): string => {
    if (days <= 0) return 'Atualizada hoje';
    if (days === 1) return 'Atualizada ontem';
    if (days < 7) return `Atualizada há ${days} dias`;
    if (days < 14) return 'Atualizada há 1 semana';
    if (days < 30) return `Atualizada há ${Math.floor(days / 7)} semanas`;
    if (days < 60) return 'Atualizada há 1 mês';
    return `Atualizada há ${Math.floor(days / 30)} meses`;
};

const dateChip = (iso: string): string => {
    const d = daysAgo(iso);
    if (d <= 0) return 'hoje';
    if (d === 1) return 'ontem';
    if (d < 7) return `${d}d`;
    return startOfDay(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const RecentMovements: React.FC<{ project: Project }> = ({ project }) => {
    const macroName = (id?: string) => project.budget?.macros?.find(m => m.id === id)?.name;
    const investorName = (id?: string) => project.investors?.find(i => i.id === id)?.name;

    const movements: Movement[] = [
        ...(project.expenses || []).map(e => ({
            key: 'e' + e.id,
            kind: 'expense' as const,
            description: e.description || 'Despesa',
            sublabel: macroName(e.macroId),
            value: e.value,
            date: e.date,
        })),
        ...(project.contributions || []).map(c => ({
            key: 'c' + c.id,
            kind: 'contribution' as const,
            description: c.description || 'Aporte',
            sublabel: investorName(c.investorId),
            value: c.value,
            date: c.date,
        })),
    ]
        .filter(m => m.date)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 5);

    // Última atualização = data mais recente entre gastos, aportes, fotos de etapa
    // e qualquer ação registrada (logs) — inclui avançar/voltar etapa e edições.
    const allDates = [
        ...(project.expenses || []).map(e => e.date),
        ...(project.contributions || []).map(c => c.date),
        ...(project.stageEvidence || []).map(s => s.date),
        ...(project.logs || []).map(l => l.timestamp),
    ].filter(Boolean).map(d => d.slice(0, 10)).sort();
    const lastDate = allDates.length ? allDates[allDates.length - 1] : null;
    const stale = lastDate ? daysAgo(lastDate) >= 7 : false;

    return (
        <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700">
            <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-black text-white text-xs md:text-sm uppercase tracking-wide md:tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-clock-rotate-left text-blue-400"></i>
                    <span>Últimas movimentações</span>
                </h3>
                {lastDate && (
                    <span className={`text-[10px] md:text-xs font-bold whitespace-nowrap flex items-center gap-1.5 ${stale ? 'text-amber-400' : 'text-slate-400'}`}>
                        <i className={`fa-solid ${stale ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
                        {lastUpdatedLabel(daysAgo(lastDate))}
                    </span>
                )}
            </div>

            {movements.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">Nenhuma movimentação ainda. Registre um gasto ou aporte.</p>
            ) : (
                <div className="space-y-2">
                    {movements.map(m => {
                        const isAporte = m.kind === 'contribution';
                        return (
                            <div key={m.key} className="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isAporte ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                    <i className={`fa-solid ${isAporte ? 'fa-arrow-down' : 'fa-arrow-up'} text-sm`}></i>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-bold text-sm truncate">{m.description}</p>
                                    <p className="text-slate-500 text-[11px] truncate">
                                        {isAporte ? 'Aporte' : 'Gasto'}
                                        {m.sublabel && <> · {m.sublabel}</>}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`font-black text-sm whitespace-nowrap ${isAporte ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isAporte ? '+' : '-'}{formatCurrency(m.value)}
                                    </p>
                                    <p className="text-slate-600 text-[10px] font-bold">{dateChip(m.date)}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RecentMovements;
