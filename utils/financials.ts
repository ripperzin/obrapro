
/**
 * Financial Calculation Utilities
 * Centralizes logic for ROI, Real ROI, and Inflation adjustments.
 */

export interface FinancialMetrics {
    nominalTotalRoi: number;   // Total ROI (e.g., 0.20 for 20%)
    nominalMonthlyRoi: number; // Monthly ROI (e.g., 0.02 for 2%)
    realMonthlyRoi: number;    // Real Monthly ROI (Nominal - Inflation)
    inflationRate: number;     // The inflation rate used
    months: number;            // Number of months calculated
}

/**
 * Calculates financial metrics for a set of values.
 * @param profit Absolute profit value (Sale - Cost)
 * @param cost Cost basis
 * @param months Number of months (duration)
 * @param inflationRate Monthly inflation rate (e.g., 0.005 for 0.5%)
 */
export const calculateFinancialMetrics = (
    profit: number,
    cost: number,
    months: number,
    inflationRate: number
): FinancialMetrics => {
    const safeCost = cost > 0 ? cost : 1; // Prevent division by zero
    const nominalTotalRoi = profit / safeCost;

    // Simple monthly average (Linear) as requested by user previously
    // If months is 0 or invalid, default to 0
    const safeMonths = months > 0 ? months : 0;
    const nominalMonthlyRoi = safeMonths > 0 ? nominalTotalRoi / safeMonths : 0;

    // Real Monthly ROI = Nominal - Inflation
    const realMonthlyRoi = nominalMonthlyRoi - inflationRate;

    return {
        nominalTotalRoi,
        nominalMonthlyRoi,
        realMonthlyRoi,
        inflationRate,
        months: safeMonths
    };
};

/**
 * aggregates metrics from multiple items (e.g. units)
 * This avoids the "average of averages" trap by summing up totals first if possible,
 * or allows passing in pre-calculated averages if that's the preferred business logic.
 * 
 * For this app, we previously used simple average of items. We will maintain that consistency
 * unless specific weighted average is requested.
 */
export const calculateAverageMetrics = (
    metricsList: FinancialMetrics[]
): FinancialMetrics | null => {
    if (metricsList.length === 0) return null;

    const count = metricsList.length;
    const totalNominalMonthly = metricsList.reduce((acc, m) => acc + m.nominalMonthlyRoi, 0);
    const totalRealMonthly = metricsList.reduce((acc, m) => acc + m.realMonthlyRoi, 0);
    const totalNominalTotal = metricsList.reduce((acc, m) => acc + m.nominalTotalRoi, 0);

    // Assuming inflation rate is constant for the period context calculation
    const inflationRate = metricsList[0].inflationRate;

    return {
        nominalTotalRoi: totalNominalTotal / count,
        nominalMonthlyRoi: totalNominalMonthly / count,
        realMonthlyRoi: totalRealMonthly / count,
        inflationRate,
        months: 0 // Avg months doesn't make much sense, typically.
    };
};
