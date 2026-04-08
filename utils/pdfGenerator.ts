
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, STAGE_NAMES } from '../types';
import { supabase } from '../supabaseClient';
import { calculateFinancialMetrics, calculateAverageMetrics } from './financials';

// ============================================================================
// IMAGE HELPERS
// ============================================================================

const getPhotoUrl = async (path: string, bucket: string = 'project-documents'): Promise<string | null> => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
    try {
        const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
        return data?.signedUrl || null;
    } catch { return null; }
};

const loadImage = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/jpeg')); }
            else reject(new Error('Canvas error'));
        };
        img.onerror = (e) => reject(e);
    });
};

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
    bg: [15, 23, 42] as [number, number, number],           // Slate-900
    cardBg: [30, 41, 59] as [number, number, number],       // Slate-800
    cardBorder: [51, 65, 85] as [number, number, number],   // Slate-700
    text: '#ffffff',
    textMuted: '#94a3b8',
    blue: '#3b82f6',
    cyan: '#22d3ee',
    green: '#4ade80',
    emerald: '#10b981',
    red: '#f87171',
    amber: '#fbbf24',
    purple: '#c084fc',
    orange: '#fb923c',
};

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatCurrencyAbbrev = (value: number): string => {
    if (Math.abs(value) >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
    return formatCurrency(value);
};

const formatDate = (dateStr: string) => {
    try { return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR'); }
    catch { return dateStr; }
};

// ============================================================================
// DRAWING HELPERS
// ============================================================================

const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
};

const drawRoundedCard = (doc: any, x: number, y: number, w: number, h: number, borderColor?: string) => {
    doc.setFillColor(...COLORS.cardBg);
    doc.setDrawColor(...COLORS.cardBorder);
    if (borderColor) {
        const [r, g, b] = hexToRgb(borderColor);
        doc.setDrawColor(r, g, b);
    }
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');
};

const drawProgressBar = (doc: any, x: number, y: number, w: number, h: number, percent: number, color: string = COLORS.blue) => {
    // Background
    doc.setFillColor(...COLORS.cardBg);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
    // Fill
    if (percent > 0) {
        const [r, g, b] = hexToRgb(color);
        doc.setFillColor(r, g, b);
        doc.roundedRect(x, y, Math.min(percent, 100) * (w / 100), h, h / 2, h / 2, 'F');
    }
};

// ============================================================================
// METRICS CALCULATION
// ============================================================================

const calculateMetrics = (project: Project, inflationRate: number = 0.005) => {
    const soldUnits = project.units.filter(u => u.status === 'Sold');
    const availableUnits = project.units.filter(u => u.status === 'Available');
    const totalCost = project.units.reduce((sum, u) => sum + u.cost, 0);
    const totalExpenses = project.expenses.reduce((sum, e) => sum + e.value, 0);
    const budgetUsage = totalCost > 0 ? (totalExpenses / totalCost) * 100 : 0;
    const totalSold = soldUnits.reduce((sum, u) => sum + (u.saleValue || 0), 0);
    const totalEstimatedSales = project.units.reduce((acc, curr) => acc + (curr.valorEstimadoVenda || 0), 0);
    const estimatedGrossProfit = totalEstimatedSales - totalCost;
    const potentialSales = availableUnits.reduce((sum, u) => sum + (u.valorEstimadoVenda || 0), 0);
    const isCompleted = project.progress === 100;
    const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);

    const realProfit = soldUnits.reduce((acc, unit) => {
        let costBase = unit.cost;
        if (isCompleted && totalUnitsArea > 0) costBase = (unit.area / totalUnitsArea) * totalExpenses;
        if (unit.saleValue && unit.saleValue > 0) return acc + (unit.saleValue - costBase);
        return acc;
    }, 0);

    // ROI
    const firstExpense = project.expenses.length > 0
        ? project.expenses.reduce((min, e) => (e.date < min.date) ? e : min, project.expenses[0])
        : null;

    const metricsList = soldUnits.map(unit => {
        if (unit.saleValue && unit.saleValue > 0) {
            let costBase = unit.cost;
            if (isCompleted && totalUnitsArea > 0) costBase = (unit.area / totalUnitsArea) * totalExpenses;
            if (costBase > 0) {
                const profit = unit.saleValue - costBase;
                let months = 0;
                if (unit.saleDate && firstExpense) {
                    const start = new Date(firstExpense.date);
                    const end = new Date(unit.saleDate);
                    months = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                }
                return calculateFinancialMetrics(profit, costBase, months, inflationRate);
            }
        }
        return null;
    }).filter(m => m !== null) as any[];

    const avgMetrics = calculateAverageMetrics(metricsList);

    return {
        totalUnits: project.units.length,
        soldUnits: soldUnits.length,
        availableUnits: availableUnits.length,
        totalCost, totalExpenses, budgetUsage, totalSold, potentialSales,
        realProfit, estimatedGrossProfit,
        monthlyMargin: avgMetrics ? avgMetrics.nominalMonthlyRoi * 100 : 0,
        realMonthlyMargin: avgMetrics ? avgMetrics.realMonthlyRoi * 100 : 0,
        inflationRate
    };
};

// ============================================================================
// DATA FETCHING
// ============================================================================

const fetchProjectData = async (projectId: string) => {
    const { data: projectData, error: projError } = await supabase
        .from('projects').select('*').eq('id', projectId).single();
    if (projError || !projectData) throw new Error('Projeto não encontrado');

    const { data: unitsData } = await supabase.from('units').select('*').eq('project_id', projectId);
    const { data: expensesData } = await supabase.from('expenses').select('*').eq('project_id', projectId);
    const { data: evidenceData } = await supabase.from('stage_evidences').select('*').eq('project_id', projectId);
    const { data: budgetData } = await supabase.from('project_budgets')
        .select(`*, macros:project_macros (*, subMacros:project_sub_macros (*))`)
        .eq('project_id', projectId).maybeSingle();

    const project: Project = {
        id: projectData.id, name: projectData.name,
        startDate: projectData.start_date, deliveryDate: projectData.delivery_date,
        unitCount: projectData.unit_count || 0, totalArea: projectData.total_area || 0,
        progress: projectData.progress || 0,
        expectedTotalCost: projectData.expected_total_cost || 0,
        expectedTotalSales: projectData.expected_total_sales || 0,
        units: (unitsData || []).map((u: any) => ({
            id: u.id, identifier: u.identifier, area: u.area, cost: u.cost,
            status: u.status, valorEstimadoVenda: u.valor_estimado_venda,
            saleValue: u.sale_value, saleDate: u.sale_date
        })),
        expenses: (expensesData || []).map((e: any) => ({
            id: e.id, description: e.description, value: e.value, date: e.date,
            userId: e.user_id, userName: e.user_name, macroId: e.macro_id, subMacroId: e.sub_macro_id,
            attachmentUrl: e.attachment_url, attachments: e.attachments || []
        })),
        stageEvidence: (evidenceData || []).map((e: any) => ({
            stage: e.stage, photos: e.photos, date: e.date, notes: e.notes, user: e.user_name
        })),
        logs: [], documents: [], diary: [],
        budget: budgetData ? {
            id: budgetData.id, projectId: budgetData.project_id,
            totalEstimated: budgetData.total_estimated || 0, totalValue: budgetData.total_value,
            macros: (budgetData.macros || []).map((m: any) => ({
                id: m.id, budgetId: m.budget_id, name: m.name, percentage: m.percentage,
                estimatedValue: m.estimated_value, spentValue: m.spent_value || 0,
                displayOrder: m.display_order,
                subMacros: (m.subMacros || []).map((s: any) => ({
                    id: s.id, projectMacroId: s.project_macro_id, name: s.name,
                    percentage: s.percentage, estimatedValue: s.estimated_value,
                    spentValue: s.spent_value || 0, displayOrder: s.display_order
                }))
            }))
        } : undefined
    };
    return project;
};

// ============================================================================
// MAIN PDF GENERATOR (mirrors InvestorView)
// ============================================================================

export const generateProjectPDF = async (projectPartial: Project, userName: string, inflationRateOverride?: number) => {
    try {
        const project = await fetchProjectData(projectPartial.id);
        const doc = new jsPDF() as any;
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const today = new Date().toLocaleDateString('pt-BR');
        const m = 15; // margins
        const cw = pageWidth - (m * 2); // content width

        let inflationRate = 0.005;
        if (typeof inflationRateOverride === 'number') {
            inflationRate = inflationRateOverride;
        } else {
            const { data: inflData } = await supabase.from('inflation_rates').select('rate').order('month', { ascending: false }).limit(1).single();
            inflationRate = inflData?.rate || 0.005;
        }

        const metrics = calculateMetrics(project, inflationRate);

        // --- HELPERS ---
        const setDarkBg = () => {
            doc.setFillColor(...COLORS.bg);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
        };

        const checkPageBreak = (neededSpace: number, cursorY: number): number => {
            if (cursorY + neededSpace > pageHeight - 20) {
                doc.addPage();
                setDarkBg();
                return 20;
            }
            return cursorY;
        };

        // ═══════════════════════════════════════════════════════════════
        // PAGE 1: HEADER + PROGRESS + VENDAS & LUCRO
        // ═══════════════════════════════════════════════════════════════
        setDarkBg();

        // --- HEADER ---
        // Badge: Portal do Investidor
        doc.setFillColor(59, 130, 246);
        doc.roundedRect(m, 12, 55, 6, 3, 3, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('PORTAL DO INVESTIDOR', m + 27.5, 16.5, { align: 'center' });

        // Project Name
        doc.setFontSize(22);
        doc.setTextColor(COLORS.text);
        doc.text(project.name.toUpperCase(), m, 28);

        // Dates
        doc.setFontSize(9);
        doc.setTextColor(COLORS.textMuted);
        let dateText = '';
        if (project.startDate) dateText += `Início: ${formatDate(project.startDate)}`;
        if (project.startDate && project.deliveryDate) dateText += '  •  ';
        if (project.deliveryDate) dateText += `Entrega: ${formatDate(project.deliveryDate)}`;
        doc.text(dateText, m, 34);

        // Generated info (right)
        doc.text(`Gerado em: ${today}`, pageWidth - m, 20, { align: 'right' });
        doc.text(`Por: ${userName}`, pageWidth - m, 26, { align: 'right' });

        let y = 40;

        // --- HERO PHOTO ---
        const latestEvidence = (project.stageEvidence || [])
            .filter(e => e.photos && e.photos.length > 0)
            .sort((a, b) => b.stage - a.stage)[0];

        if (latestEvidence?.photos?.[0]) {
            try {
                const signedUrl = await getPhotoUrl(latestEvidence.photos[0]);
                if (signedUrl) {
                    const imgData = await loadImage(signedUrl);
                    const imgW = cw;
                    const imgH = 55;

                    // Photo frame
                    doc.setFillColor(...COLORS.cardBg);
                    doc.setDrawColor(...COLORS.cardBorder);
                    doc.roundedRect(m, y, imgW, imgH + 4, 4, 4, 'FD');
                    doc.addImage(imgData, 'JPEG', m + 2, y + 2, imgW - 4, imgH);

                    // Label overlay
                    doc.setFillColor(0, 0, 0);
                    doc.rect(m + 2, y + imgH - 10, imgW - 4, 12, 'F');
                    doc.setFontSize(9);
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.text(STAGE_NAMES[latestEvidence.stage] || '', m + 6, y + imgH - 2);

                    doc.setFontSize(8);
                    doc.setTextColor(COLORS.textMuted);
                    if (latestEvidence.date) {
                        doc.text(`Registro: ${formatDate(latestEvidence.date)}`, pageWidth - m - 6, y + imgH - 2, { align: 'right' });
                    }

                    y += imgH + 10;
                }
            } catch { y += 5; }
        }

        // --- PROGRESS ---
        y = checkPageBreak(25, y);
        doc.setFontSize(12);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Progresso Geral', m, y);
        doc.setFontSize(20);
        doc.setTextColor(COLORS.blue);
        doc.text(`${project.progress}%`, pageWidth - m, y, { align: 'right' });

        y += 5;
        drawProgressBar(doc, m, y, cw, 6, project.progress, COLORS.blue);

        y += 10;
        doc.setFontSize(9);
        doc.setTextColor(COLORS.textMuted);
        doc.setFont('helvetica', 'normal');
        doc.text(`Etapa atual: ${STAGE_NAMES[project.progress] || 'N/A'}`, m, y);

        // ═══════════════════════════════════════════════════════════════
        // VENDAS & LUCRO SECTION
        // ═══════════════════════════════════════════════════════════════
        y += 12;
        y = checkPageBreak(70, y);

        // Section Title
        doc.setFontSize(11);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('VENDAS & LUCRO', m + 14, y);
        doc.setFillColor(59, 130, 246);
        doc.circle(m + 5, y - 2, 4, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text('$', m + 5, y - 0.5, { align: 'center' });

        // Badge right
        doc.setFillColor(...COLORS.cardBg);
        doc.setDrawColor(...COLORS.cardBorder);
        doc.roundedRect(pageWidth - m - 40, y - 5, 40, 7, 3, 3, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(COLORS.textMuted);
        doc.text('Visão do Investidor', pageWidth - m - 20, y - 0.5, { align: 'center' });

        y += 8;

        // TOP ROW: Unidades Vendidas + Total Liquidado
        const topRowH = 35;
        const col1W = cw * 0.38;
        const col2W = cw * 0.58;
        const gap = cw * 0.04;

        // Card 1: Unidades Vendidas
        drawRoundedCard(doc, m, y, col1W, topRowH);
        doc.setFontSize(8);
        doc.setTextColor(COLORS.textMuted);
        doc.setFont('helvetica', 'bold');
        doc.text('UND. VENDIDAS', m + 4, y + 6);

        const salesPct = Math.round((metrics.soldUnits / (metrics.totalUnits || 1)) * 100);
        doc.setFontSize(16);
        doc.setTextColor(COLORS.text);
        doc.text(`${salesPct}%`, m + 8, y + 18);

        doc.setFontSize(20);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text(`${metrics.soldUnits}`, m + col1W / 2 + 8, y + 18);
        doc.setFontSize(12);
        doc.setTextColor(COLORS.textMuted);
        doc.text(`/${metrics.totalUnits}`, m + col1W / 2 + 8 + doc.getTextWidth(`${metrics.soldUnits}`), y + 18);
        doc.setFontSize(7);
        doc.setTextColor(COLORS.blue);
        doc.text('METAS', m + col1W / 2 + 8, y + 24);

        // Card 2: Total Liquidado
        const emeraldRgb = hexToRgb(COLORS.emerald);
        doc.setFillColor(emeraldRgb[0], emeraldRgb[1], emeraldRgb[2]);
        doc.roundedRect(m + col1W + gap, y, col2W, topRowH, 3, 3, 'F');
        doc.setFillColor(15, 23, 42); // darker overlay
        doc.roundedRect(m + col1W + gap, y, col2W, topRowH, 3, 3, 'F');
        // Simulate emerald gradient
        doc.setFillColor(16, 185, 129, 0.15);
        drawRoundedCard(doc, m + col1W + gap, y, col2W, topRowH, COLORS.emerald);

        doc.setFontSize(8);
        doc.setTextColor(COLORS.emerald);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL LIQUIDADO', m + col1W + gap + 6, y + 8);

        doc.setFontSize(18);
        doc.setTextColor(COLORS.text);
        doc.text(formatCurrencyAbbrev(metrics.totalSold), m + col1W + gap + 6, y + 20);

        doc.setFontSize(7);
        doc.setTextColor(COLORS.textMuted);
        doc.text('✓ Contratos validados', m + col1W + gap + 6, y + 28);

        y += topRowH + 5;

        // BOTTOM ROW: 4 spec cards
        y = checkPageBreak(35, y);
        const specW = (cw - 9) / 4;
        const specH = 28;
        const specGap = 3;

        const specs = [
            { label: 'LUCRO REAL', value: formatCurrencyAbbrev(metrics.realProfit), badge: 'Real', badgeColor: COLORS.blue, borderColor: COLORS.blue },
            { label: 'LUCRO PROJ.', value: formatCurrencyAbbrev(metrics.estimatedGrossProfit), badge: 'Est.', badgeColor: '#475569', borderColor: COLORS.cyan },
            { label: 'POTENCIAL', value: metrics.potentialSales > 0 ? formatCurrencyAbbrev(metrics.potentialSales) : 'VENDIDO', badge: metrics.potentialSales > 0 ? '' : 'Esgotado', badgeColor: COLORS.orange, borderColor: COLORS.orange },
            { label: 'ROI REAL', value: `${(metrics.realMonthlyMargin || 0).toFixed(1)}%`, badge: '', badgeColor: '', borderColor: COLORS.purple, extra: `${(metrics.monthlyMargin || 0).toFixed(1)}% -${(metrics.inflationRate * 100).toFixed(1)}%` }
        ];

        specs.forEach((spec, i) => {
            const sx = m + i * (specW + specGap);
            drawRoundedCard(doc, sx, y, specW, specH, spec.borderColor);

            // Badge
            if (spec.badge) {
                const [br, bg2, bb] = hexToRgb(spec.badgeColor);
                doc.setFillColor(br, bg2, bb);
                const bw = doc.getTextWidth(spec.badge) * 1.5 + 4;
                doc.roundedRect(sx + specW - bw - 3, y + 2, bw, 5, 2, 2, 'F');
                doc.setFontSize(6);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.text(spec.badge.toUpperCase(), sx + specW - bw / 2 - 3, y + 5.5, { align: 'center' });
            }

            // Label
            doc.setFontSize(6.5);
            doc.setTextColor(COLORS.textMuted);
            doc.setFont('helvetica', 'bold');
            doc.text(spec.label, sx + 4, y + 12);

            // Value
            doc.setFontSize(12);
            doc.setTextColor(COLORS.text);
            doc.text(spec.value, sx + 4, y + 20);

            // Extra (for ROI)
            if (spec.extra) {
                doc.setFontSize(6);
                doc.setTextColor(COLORS.textMuted);
                doc.text(spec.extra, sx + 4, y + 25);
            }
        });

        y += specH + 10;

        // ═══════════════════════════════════════════════════════════════
        // CONTROLE DE ORÇAMENTO
        // ═══════════════════════════════════════════════════════════════
        y = checkPageBreak(60, y);

        doc.setFontSize(11);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Controle de Orçamento', m + 14, y);
        // Icon
        const [gr, gg, gb] = hexToRgb(COLORS.green);
        doc.setFillColor(gr, gg, gb);
        doc.circle(m + 5, y - 2, 4, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text('$', m + 5, y - 0.5, { align: 'center' });

        // Usage badge (right)
        const usageColor = metrics.budgetUsage > 100 ? COLORS.red : COLORS.green;
        const [ur, ug, ub] = hexToRgb(usageColor);
        doc.setFillColor(ur, ug, ub);
        const usageText = `${metrics.budgetUsage.toFixed(0)}% utilizado`;
        const usageTw = doc.getTextWidth(usageText) * 1.3 + 6;
        doc.roundedRect(pageWidth - m - usageTw, y - 5, usageTw, 7, 3, 3, 'F');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.text(usageText, pageWidth - m - usageTw / 2, y - 0.5, { align: 'center' });

        y += 8;

        // 3 Stats: Orçamento / Gasto / Saldo
        const statW = (cw - 6) / 3;
        const statH = 18;

        const budgetStats = [
            { label: 'Orçamento', value: formatCurrencyAbbrev(metrics.totalCost), color: COLORS.text },
            { label: 'Gasto', value: formatCurrencyAbbrev(metrics.totalExpenses), color: COLORS.blue },
            { label: 'Saldo', value: formatCurrencyAbbrev(metrics.totalCost - metrics.totalExpenses), color: (metrics.totalCost - metrics.totalExpenses) >= 0 ? COLORS.green : COLORS.red }
        ];

        budgetStats.forEach((stat, i) => {
            const sx = m + i * (statW + 3);
            drawRoundedCard(doc, sx, y, statW, statH);
            doc.setFontSize(6.5);
            doc.setTextColor(COLORS.textMuted);
            doc.setFont('helvetica', 'bold');
            doc.text(stat.label.toUpperCase(), sx + statW / 2, y + 6, { align: 'center' });
            doc.setFontSize(11);
            doc.setTextColor(stat.color);
            doc.text(stat.value, sx + statW / 2, y + 14, { align: 'center' });
        });

        y += statH + 5;

        // Budget Progress Bar
        drawProgressBar(doc, m, y, cw, 5, metrics.budgetUsage, metrics.budgetUsage > 100 ? COLORS.red : COLORS.green);
        y += 12;

        // Macros
        if (project.budget?.macros?.length) {
            doc.setFontSize(8);
            doc.setTextColor(COLORS.textMuted);
            doc.setFont('helvetica', 'bold');
            doc.text('POR CATEGORIA', m, y);
            y += 6;

            const macros = [...project.budget.macros].sort((a, b) => a.displayOrder - b.displayOrder);

            for (const macro of macros) {
                y = checkPageBreak(25, y);

                const pct = macro.estimatedValue > 0 ? (macro.spentValue / macro.estimatedValue) * 100 : 0;
                const isOver = pct > 100;

                // Macro card bg
                drawRoundedCard(doc, m, y, cw, 16);

                // Name
                doc.setFontSize(9);
                doc.setTextColor(COLORS.text);
                doc.setFont('helvetica', 'bold');
                doc.text(macro.name, m + 4, y + 5);

                // Percentage
                doc.setFontSize(8);
                doc.setTextColor(isOver ? COLORS.red : COLORS.green);
                doc.text(`${pct.toFixed(0)}%`, pageWidth - m - 4, y + 5, { align: 'right' });

                // Progress bar
                drawProgressBar(doc, m + 4, y + 8, cw - 8, 2.5, pct, isOver ? COLORS.red : COLORS.blue);

                // Values
                doc.setFontSize(7);
                doc.setTextColor(COLORS.textMuted);
                doc.setFont('helvetica', 'normal');
                doc.text(`Gasto: ${formatCurrencyAbbrev(macro.spentValue)}`, m + 4, y + 14);
                doc.text(`Meta: ${formatCurrencyAbbrev(macro.estimatedValue)}`, pageWidth - m - 4, y + 14, { align: 'right' });

                y += 18;

                // Sub-macros
                if (macro.subMacros?.length) {
                    for (const sub of macro.subMacros.sort((a: any, b: any) => a.displayOrder - b.displayOrder)) {
                        y = checkPageBreak(10, y);
                        const subPct = sub.estimatedValue > 0 ? (sub.spentValue / sub.estimatedValue) * 100 : 0;

                        doc.setDrawColor(...COLORS.cardBorder);
                        doc.line(m + 8, y, m + 8, y + 6);

                        doc.setFontSize(7);
                        doc.setTextColor('#cbd5e1');
                        doc.setFont('helvetica', 'bold');
                        doc.text(sub.name, m + 12, y + 3);

                        doc.setTextColor(subPct > 100 ? COLORS.red : COLORS.textMuted);
                        doc.setFont('helvetica', 'normal');
                        doc.text(`${formatCurrencyAbbrev(sub.spentValue)} / ${formatCurrencyAbbrev(sub.estimatedValue)}`, pageWidth - m - 4, y + 3, { align: 'right' });

                        // thin bar
                        drawProgressBar(doc, m + 12, y + 5, cw - 20, 1.5, subPct, subPct > 100 ? COLORS.red : COLORS.blue);
                        y += 9;
                    }
                }

                y += 2;
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // EXTRATO DE DESPESAS
        // ═══════════════════════════════════════════════════════════════
        y += 5;
        y = checkPageBreak(40, y);

        doc.setFontSize(11);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Extrato Completo de Despesas', m, y);
        y += 5;

        const allExpenses = [...project.expenses]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(e => {
                const hasAttachment = !!(e.attachmentUrl || (e.attachments && e.attachments.length > 0));
                return [
                    formatDate(e.date),
                    e.description,
                    hasAttachment ? '📎' : '-',
                    formatCurrency(e.value)
                ];
            });

        if (allExpenses.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Data', 'Descrição', 'Anexo', 'Valor']],
                body: allExpenses,
                theme: 'grid',
                headStyles: { fillColor: COLORS.cardBg, textColor: [255, 255, 255], lineColor: COLORS.cardBorder, fontSize: 8 },
                bodyStyles: { fillColor: COLORS.bg, textColor: [200, 200, 200], lineColor: COLORS.cardBorder, fontSize: 8 },
                alternateRowStyles: { fillColor: [20, 28, 48] },
                styles: { cellPadding: 3, font: 'helvetica' },
                columnStyles: {
                    0: { cellWidth: 25 },
                    2: { cellWidth: 15, halign: 'center' },
                    3: { cellWidth: 35, halign: 'right' }
                },
                margin: { left: m, right: m },
                didDrawPage: () => setDarkBg()
            });
            y = (doc as any).lastAutoTable.finalY + 10;
        } else {
            doc.setFontSize(9);
            doc.setTextColor(COLORS.textMuted);
            doc.text('Nenhuma despesa registrada.', m, y + 5);
            y += 15;
        }

        // ═══════════════════════════════════════════════════════════════
        // TIMELINE VISUAL (com fotos)
        // ═══════════════════════════════════════════════════════════════
        doc.addPage();
        setDarkBg();
        let ty = 20;

        doc.setFontSize(14);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Cronograma de Etapas', m, ty);
        ty += 12;

        const lineX = m + 8;
        const stages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

        // Draw full vertical line
        doc.setDrawColor(...COLORS.cardBorder);
        doc.setLineWidth(1);
        doc.line(lineX, ty, lineX, pageHeight - 20);

        for (const stage of stages) {
            if (ty > pageHeight - 55) {
                doc.addPage();
                setDarkBg();
                ty = 20;
                doc.setDrawColor(...COLORS.cardBorder);
                doc.setLineWidth(1);
                doc.line(lineX, 0, lineX, pageHeight - 20);
            }

            const isCompleted = project.progress >= stage;
            const evidence = project.stageEvidence?.find(e => e.stage === stage);
            const hasPhoto = evidence?.photos && evidence.photos.length > 0;

            // Dot
            if (isCompleted) {
                const [br, bg2, bb] = hexToRgb(COLORS.blue);
                doc.setFillColor(br, bg2, bb);
                doc.setDrawColor(br, bg2, bb);
            } else {
                doc.setFillColor(...COLORS.cardBg);
                doc.setDrawColor(...COLORS.cardBorder);
            }
            doc.circle(lineX, ty + 2, 3, 'FD');

            // Check mark for completed
            if (isCompleted) {
                doc.setFontSize(6);
                doc.setTextColor(255, 255, 255);
                doc.text('✓', lineX, ty + 3.5, { align: 'center' });
            }

            // Stage Name
            doc.setFontSize(10);
            doc.setTextColor(isCompleted ? COLORS.text : COLORS.textMuted);
            doc.setFont('helvetica', 'bold');
            doc.text(STAGE_NAMES[stage] || `${stage}%`, lineX + 12, ty + 3);

            // Date
            if (evidence?.date) {
                doc.setFontSize(8);
                doc.setTextColor(COLORS.textMuted);
                doc.setFont('helvetica', 'normal');
                const nameW = doc.getTextWidth(STAGE_NAMES[stage] || `${stage}%`);
                doc.text(formatDate(evidence.date), lineX + 12 + nameW + 5, ty + 3);
            }

            ty += 8;

            // Photo
            if (hasPhoto && evidence!.photos[0]) {
                const imgW = 55;
                const imgH = 38;

                if (ty + imgH > pageHeight - 20) {
                    doc.addPage();
                    setDarkBg();
                    ty = 20;
                    doc.setDrawColor(...COLORS.cardBorder);
                    doc.setLineWidth(1);
                    doc.line(lineX, 0, lineX, pageHeight - 20);
                }

                try {
                    const signedUrl = await getPhotoUrl(evidence!.photos[0]);
                    if (signedUrl) {
                        const imgData = await loadImage(signedUrl);
                        doc.setDrawColor(...COLORS.cardBorder);
                        doc.roundedRect(lineX + 12, ty, imgW, imgH, 2, 2, 'S');
                        doc.addImage(imgData, 'JPEG', lineX + 12, ty, imgW, imgH);
                        ty += imgH + 3;
                    }
                } catch {
                    doc.setFontSize(7);
                    doc.setTextColor(COLORS.red);
                    doc.text('[Imagem indisponível]', lineX + 12, ty + 4);
                    ty += 8;
                }
            }

            // Notes
            if (evidence?.notes) {
                const splitNotes = doc.splitTextToSize(evidence.notes, cw - 30);
                doc.setFontSize(8);
                doc.setTextColor(COLORS.textMuted);
                doc.setFont('helvetica', 'italic');
                doc.text(splitNotes, lineX + 12, ty + 3);
                ty += (splitNotes.length * 4) + 4;
            } else if (!hasPhoto) {
                ty += 3;
            }

            ty += 8;
        }

        // ═══════════════════════════════════════════════════════════════
        // FOOTER (all pages)
        // ═══════════════════════════════════════════════════════════════
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(COLORS.textMuted);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - m, pageHeight - 8, { align: 'right' });
            doc.text('Obra Pro © Portal do Investidor', m, pageHeight - 8);
        }

        doc.save(`Relatorio_${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (e: any) {
        console.error('CRITICAL PDF ERROR:', e);
        alert('Erro crítico ao gerar PDF: ' + e.message);
        throw e;
    }
};
