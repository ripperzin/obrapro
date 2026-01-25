
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area } from 'recharts';
import { Project, STAGE_NAMES } from '../types';
import { formatCurrency, formatCurrencyAbbrev } from '../utils';

interface SCurveChartProps {
    projects: Project[];
}

const SCurveChart: React.FC<SCurveChartProps> = ({ projects }) => {
    // 1. Prepare Data
    const data = useMemo(() => {
        if (!projects || projects.length === 0) return [];

        // Find global start and end dates across all projects to define the timeline
        // Find global start and end dates across all projects (Macros ONLY)
        const allStartDates = projects.map(p => {
            if (p.budget?.macros && p.budget.macros.length > 0) {
                const starts = p.budget.macros.map(m => m.plannedStartDate).filter(Boolean) as string[];
                return starts.length > 0 ? starts.reduce((a, b) => a < b ? a : b) : null;
            }
            return null;
        }).filter(Boolean) as string[];

        const allEndDates = projects.map(p => {
            if (p.budget?.macros && p.budget.macros.length > 0) {
                const ends = p.budget.macros.map(m => m.plannedEndDate).filter(Boolean) as string[];
                return ends.length > 0 ? ends.reduce((a, b) => a > b ? a : b) : null;
            }
            return null;
        }).filter(Boolean) as string[];

        if (allStartDates.length === 0) return [];

        const minDate = new Date(Math.min(...allStartDates.map(d => new Date(d).getTime())));
        // Use max delivery date or today + 3 months, whichever is further
        const maxDelivery = allEndDates.length > 0 ? Math.max(...allEndDates.map(d => new Date(d).getTime())) : 0;
        const maxDate = new Date(Math.max(Date.now(), maxDelivery));

        // Generate monthly buckets from minDate to maxDate
        const months: any[] = [];
        let currentDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

        while (currentDate <= endDate) {
            months.push({
                date: new Date(currentDate),
                label: currentDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                planned: 0,
                actual: 0
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        // 2. Calculate Cumulative Values
        let cumulativePlanned = 0;
        let cumulativeActual = 0;

        // Iterate through each month to sum up values
        return months.map((month) => {
            const monthTime = month.date.getTime();

            // Actual: Sum of expenses up to this month
            // We can optimize this by maintaining a running total if we iterate sequentially
            // But doing it per month is safer for clarity first

            // Calculate expenses in this specific month
            projects.forEach(p => {
                p.expenses.forEach(e => {
                    const eDate = new Date(e.date);
                    if (eDate.getFullYear() === month.date.getFullYear() && eDate.getMonth() === month.date.getMonth()) {
                        cumulativeActual += e.value;
                    }
                });

                // Planned: Physical-Financial Schedule logic (BUDGET ONLY)
                if (p.budget?.macros && p.budget.macros.length > 0) {
                    p.budget.macros.forEach(m => {
                        if (m.plannedStartDate && m.plannedEndDate && m.estimatedValue > 0) {
                            const mStart = new Date(m.plannedStartDate);
                            const mEnd = new Date(m.plannedEndDate);

                            // Normalize to start of month for comparison
                            const startCompare = new Date(mStart.getFullYear(), mStart.getMonth(), 1);
                            const endCompare = new Date(mEnd.getFullYear(), mEnd.getMonth(), 1);

                            if (month.date >= startCompare && month.date <= endCompare) {
                                // Calculate duration in months (including both start and end)
                                let duration = (mEnd.getFullYear() - mStart.getFullYear()) * 12;
                                duration = duration - mStart.getMonth() + mEnd.getMonth() + 1;
                                duration = duration <= 0 ? 1 : duration;

                                cumulativePlanned += m.estimatedValue / duration;
                            }
                        }
                    });
                }
            });

            return {
                name: month.label,
                Planejado: cumulativePlanned,
                Realizado: month.date <= new Date() ? cumulativeActual : null, // Don't show future actuals
                // Optional: Variance
            };
        });

    }, [projects]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500">
                <p>Sem dados suficientes para gerar a Curva S (datas ou custos ausentes).</p>
            </div>
        );
    }

    return (
        <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={data}
                    margin={{
                        top: 10,
                        right: 10,
                        left: 0,
                        bottom: 0,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis
                        dataKey="name"
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        minTickGap={30}
                    />
                    <YAxis
                        stroke="#94a3b8"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(value) => formatCurrencyAbbrev(value)}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                        formatter={(value: number) => formatCurrencyAbbrev(value)}
                        labelStyle={{ color: '#94a3b8' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Line
                        type="monotone"
                        dataKey="Planejado"
                        stroke="#64748b"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 8 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="Realizado"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default SCurveChart;
