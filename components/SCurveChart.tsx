
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area } from 'recharts';
import { Project, STAGE_NAMES } from '../types';
import { formatCurrency } from '../utils';

interface SCurveChartProps {
    projects: Project[];
}

const SCurveChart: React.FC<SCurveChartProps> = ({ projects }) => {
    // 1. Prepare Data
    const data = useMemo(() => {
        if (!projects || projects.length === 0) return [];

        // Find global start and end dates across all projects to define the timeline
        const allStartDates = projects.map(p => {
            if (p.startDate) return p.startDate;
            // Fallback: use first expense date if available
            if (p.expenses && p.expenses.length > 0) {
                return p.expenses.reduce((min, e) => e.date < min ? e.date : min, p.expenses[0].date);
            }
            return null;
        }).filter(Boolean) as string[];

        const allEndDates = projects.map(p => p.deliveryDate).filter(Boolean) as string[];

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

                // Planned: Linear distribution over project duration
                // If this month is within project start/end, add (totalCost / durationMonths)
                if (p.startDate && p.deliveryDate && p.expectedTotalCost) {
                    const pStart = new Date(p.startDate);
                    const pEnd = new Date(p.deliveryDate);

                    if (month.date >= pStart && month.date <= pEnd) {
                        // Calculate duration in months
                        let duration = (pEnd.getFullYear() - pStart.getFullYear()) * 12;
                        duration -= pStart.getMonth();
                        duration += pEnd.getMonth();
                        duration = duration <= 0 ? 1 : duration;

                        const monthlyCost = p.expectedTotalCost / duration;
                        cumulativePlanned += monthlyCost;
                    }
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
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
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
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                        formatter={(value: number) => formatCurrency(value)}
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
