export interface FinancialMetrics {
    profit: number;
    cost: number;
    months: number;
    nominalTotalRoi: number;
    nominalMonthlyRoi: number;
    realMonthlyRoi: number;
    inflationRate: number;
}

/**
 * Calculates financial metrics for a single unit sale
 * @param profit Net profit (Sale - Cost)
 * @param cost Base cost
 * @param months Duration in months
 * @param inflationRate Monthly inflation rate (e.g. 0.005 for 0.5%)
 */
export const calculateFinancialMetrics = (
    profit: number,
    cost: number,
    months: number,
    inflationRate: number
): FinancialMetrics => {
    const nominalTotalRoi = cost > 0 ? profit / cost : 0;
    const nominalMonthlyRoi = months > 0 ? nominalTotalRoi / months : 0;
    const realMonthlyRoi = nominalMonthlyRoi - inflationRate;

    return {
        profit,
        cost,
        months,
        nominalTotalRoi,
        nominalMonthlyRoi,
        realMonthlyRoi,
        inflationRate,
    };
};

/**
 * Calculates average metrics for a list of sold units
 */
export const calculateAverageMetrics = (metricsList: FinancialMetrics[]): FinancialMetrics | null => {
    if (metricsList.length === 0) return null;

    const count = metricsList.length;
    const totalProfit = metricsList.reduce((sum, m) => sum + m.profit, 0);
    const totalCost = metricsList.reduce((sum, m) => sum + m.cost, 0);
    const totalNominalRoi = metricsList.reduce((sum, m) => sum + m.nominalTotalRoi, 0);
    const totalNominalMonthlyRoi = metricsList.reduce((sum, m) => sum + m.nominalMonthlyRoi, 0);
    const totalRealMonthlyRoi = metricsList.reduce((sum, m) => sum + m.realMonthlyRoi, 0);

    return {
        profit: totalProfit / count,
        cost: totalCost / count,
        months: metricsList.reduce((sum, m) => sum + m.months, 0) / count,
        nominalTotalRoi: totalNominalRoi / count,
        nominalMonthlyRoi: totalNominalMonthlyRoi / count,
        realMonthlyRoi: totalRealMonthlyRoi / count,
        inflationRate: metricsList[0].inflationRate,
    };
};
