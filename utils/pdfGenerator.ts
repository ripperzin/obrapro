
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, STAGE_NAMES, STAGE_ICONS } from '../types';
import { supabase } from '../supabaseClient';
import { calculateFinancialMetrics, calculateAverageMetrics } from './financials';

// Helper to resolve Supabase URL if needed
const getPhotoUrl = async (path: string): Promise<string | null> => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;

    try {
        const { data } = await supabase.storage
            .from('project-documents')
            .createSignedUrl(path, 3600);
        return data?.signedUrl || null;
    } catch (err) {
        console.warn('Error creating signed URL:', err);
        return null;
    }
};

// Helper to load image from URL
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
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg'));
            } else {
                reject(new Error('Could not get canvas context'));
            }
        };
        img.onerror = (e) => reject(e);
    });
};

const COLORS = {
    bg: '#0f172a',        // Slate-900
    cardBg: '#1e293b',    // Slate-800
    cardBorder: '#334155',// Slate-700
    text: '#ffffff',      // White
    textMuted: '#94a3b8', // Slate-400
    blue: '#3b82f6',
    cyan: '#22d3ee',
    green: '#4ade80',
    red: '#f87171',
    amber: '#fbbf24',
    purple: '#c084fc',
    orange: '#fb923c',
    white: '#ffffff'      // Added white as requested/needed
};

// Formatting helpers
const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatCurrencyFull = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateStr: string) => new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');

// Drawing Helpers
const drawCard = (doc: jsPDF, x: number, y: number, w: number, h: number, value: string, label: string, color: string = COLORS.text) => {
    // Semi-transparent card effect (simulated with solid colors for PDF)
    doc.setFillColor(30, 41, 59); // Slate-800 (Card BG)
    doc.setDrawColor(51, 65, 85); // Slate-700 (Border)
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');

    // Value
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color);
    doc.text(value, x + (w / 2), y + (h / 2) - 2, { align: 'center' });

    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.textMuted);
    doc.text(label.toUpperCase(), x + (w / 2), y + (h / 2) + 6, { align: 'center' });
};

const calculateMetrics = (project: Project, totalUnitsArea: number = 0, inflationRate: number = 0) => {
    const soldUnits = project.units.filter(u => u.status === 'Sold');
    const availableUnits = project.units.filter(u => u.status === 'Available');
    const totalCost = project.units.reduce((sum, u) => sum + u.cost, 0);
    const totalExpenses = project.expenses.reduce((sum, e) => sum + e.value, 0);
    const budgetUsage = totalCost > 0 ? (totalExpenses / totalCost) * 100 : 0;
    const totalSold = soldUnits.reduce((sum, u) => sum + (u.saleValue || 0), 0);

    // New Metrics (V2)
    const totalEstimatedSales = project.units.reduce((acc, curr) => acc + (curr.valorEstimadoVenda || 0), 0);
    const estimatedGrossProfit = totalEstimatedSales - totalCost;
    const potentialSales = availableUnits.reduce((sum, u) => sum + (u.valorEstimadoVenda || 0), 0);

    // Lucro Real Calculation
    const isCompleted = project.progress === 100;
    const firstExpense = project.expenses.length > 0
        ? project.expenses.reduce((min, e) => (e.date < min.date) ? e : min, project.expenses[0])
        : null;

    const realProfit = soldUnits.reduce((acc, unit) => {
        let costBase = unit.cost;
        if (isCompleted && totalUnitsArea > 0) {
            costBase = (unit.area / totalUnitsArea) * totalExpenses;
        }
        if (unit.saleValue && unit.saleValue > 0) {
            return acc + (unit.saleValue - costBase);
        }
        return acc;
    }, 0);

    // Margins logic
    const metricsList = soldUnits.map(unit => {
        if (unit.saleValue && unit.saleValue > 0) {
            let costBase = unit.cost;
            if (isCompleted && totalUnitsArea > 0) {
                costBase = (unit.area / totalUnitsArea) * totalExpenses;
            }
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
        totalCost,
        totalExpenses,
        budgetUsage,
        totalSold,
        potentialSales,
        averageMargin: avgMetrics ? avgMetrics.nominalTotalRoi * 100 : 0,
        monthlyMargin: avgMetrics ? avgMetrics.nominalMonthlyRoi * 100 : 0,
        realMonthlyMargin: avgMetrics ? avgMetrics.realMonthlyRoi * 100 : 0,
        realProfit,
        estimatedGrossProfit,
        inflationRate
    };
};

const fetchProjectData = async (projectId: string) => {
    // 1. Fetch Project Basics
    const { data: projectData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (projError || !projectData) throw new Error('Projeto não encontrado');

    // 2. Fetch Units
    const { data: unitsData } = await supabase.from('units').select('*').eq('project_id', projectId);

    // 3. Fetch Expenses
    const { data: expensesData } = await supabase.from('expenses').select('*').eq('project_id', projectId);

    // 4. Fetch Evidence
    const { data: evidenceData } = await supabase.from('stage_evidences').select('*').eq('project_id', projectId);

    // 5. Fetch Budget
    const { data: budgetData } = await supabase
        .from('project_budgets')
        .select(`
            *,
            macros:project_macros (
                *,
                subMacros:project_sub_macros (*)
            )
        `)
        .eq('project_id', projectId)
        .maybeSingle();

    // Map to Project Type with defensive checks
    const project: Project = {
        id: projectData.id,
        name: projectData.name,
        startDate: projectData.start_date,
        deliveryDate: projectData.delivery_date,
        unitCount: projectData.unit_count || 0,
        totalArea: projectData.total_area || 0,
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
            userId: e.user_id, userName: e.user_name, macroId: e.macro_id, subMacroId: e.sub_macro_id
        })),
        stageEvidence: (evidenceData || []).map((e: any) => ({
            stage: e.stage, photos: e.photos, date: e.date, notes: e.notes, user: e.user_name
        })),
        logs: [], documents: [], diary: [],
        budget: budgetData ? {
            id: budgetData.id,
            projectId: budgetData.project_id,
            totalEstimated: budgetData.total_estimated || 0,
            totalValue: budgetData.total_value, // Legacy field
            macros: (budgetData.macros || []).map((m: any) => ({
                id: m.id, budgetId: m.budget_id, name: m.name, percentage: m.percentage, estimatedValue: m.estimated_value,
                spentValue: m.spent_value || 0, displayOrder: m.display_order,
                subMacros: (m.subMacros || []).map((s: any) => ({
                    id: s.id, projectMacroId: s.project_macro_id, name: s.name, percentage: s.percentage, estimatedValue: s.estimated_value,
                    spentValue: s.spent_value || 0, displayOrder: s.display_order
                }))
            }))
        } : undefined
    };

    return project;
};

export const generateProjectPDF = async (projectPartial: Project, userName: string, inflationRateOverride?: number) => {
    try {
        // Always fetch fresh data to ensure we have budget and everything
        const project = await fetchProjectData(projectPartial.id);

        const doc = new jsPDF() as any;
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const today = new Date().toLocaleDateString('pt-BR');
        const margins = 15;
        const contentWidth = pageWidth - (margins * 2);

        let inflationRate = 0.005;
        if (typeof inflationRateOverride === 'number') {
            inflationRate = inflationRateOverride;
        } else {
            const { data: inflationData } = await supabase
                .from('inflation_rates')
                .select('rate')
                .order('month', { ascending: false })
                .limit(1)
                .single();
            inflationRate = inflationData?.rate || 0.005;
        }

        const metrics = calculateMetrics(project, project.totalArea, inflationRate);

        // --- Helper to set Dark Background on new pages ---
        const setDarkBg = () => {
            doc.setFillColor(15, 23, 42); // #0f172a (Slate-900)
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
        };

        // Initialize first page
        setDarkBg();

        // --- Header ---
        doc.setFontSize(22);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text(project.name.toUpperCase(), margins, 20);

        doc.setFontSize(10);
        doc.setTextColor(COLORS.blue);
        doc.text('PORTAL DO INVESTIDOR (PDF)', margins, 28);

        // Header Right Info
        doc.setFontSize(9);
        doc.setTextColor(COLORS.textMuted);
        doc.text(`Gerado em: ${today}`, pageWidth - margins, 20, { align: 'right' });
        doc.text(`Por: ${userName}`, pageWidth - margins, 26, { align: 'right' });

        // Dates
        let dateText = '';
        if (project.startDate) dateText += `Início: ${formatDate(project.startDate)}`;
        if (project.startDate && project.deliveryDate) dateText += '  |  ';
        if (project.deliveryDate) dateText += `Previsão: ${formatDate(project.deliveryDate)}`;

        doc.setTextColor(COLORS.text);
        doc.text(dateText, pageWidth - margins, 33, { align: 'right' });

        // --- Header Photo ---
        // Find current stage evidence photo
        const currentStageEvidence = project.stageEvidence?.find(e => e.stage === project.progress);
        if (currentStageEvidence?.photos && currentStageEvidence.photos.length > 0) {
            try {
                // Determine layout adjustment if photo exists
                const imgW = 60;
                const imgH = 40;
                const headerImgX = pageWidth - margins - imgW;
                const headerImgY = 38;

                // Get Signed URL Here!
                const signedUrl = await getPhotoUrl(currentStageEvidence.photos[0]);
                if (signedUrl) {
                    // Load and draw photo
                    const headerImgData = await loadImage(signedUrl);

                    doc.setDrawColor(COLORS.blue);
                    doc.setLineWidth(0.5);
                    doc.rect(headerImgX, headerImgY, imgW, imgH);
                    doc.addImage(headerImgData, 'JPEG', headerImgX, headerImgY, imgW, imgH);

                    // "Foto Atual" label
                    doc.setFillColor(COLORS.blue);
                    doc.rect(headerImgX, headerImgY + imgH - 5, imgW, 5, 'F');
                    doc.setFontSize(8);
                    doc.setTextColor(COLORS.white);
                    doc.setFont('helvetica', 'bold');
                    doc.text('REGISTRO ATUAL', headerImgX + (imgW / 2), headerImgY + imgH - 1.5, { align: 'center' });
                }

            } catch (err) {
                console.warn('Could not load header photo', err);
            }
        }

        let cursorY = 85;

        // --- Progress Section ---
        doc.setFontSize(12);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Progresso Geral', margins, cursorY);

        doc.setFontSize(24);
        doc.setTextColor(COLORS.blue);
        doc.text(`${project.progress}%`, pageWidth - margins, cursorY, { align: 'right' });

        cursorY += 5;
        // Progress Bar Background
        doc.setFillColor(30, 41, 59); // Slate-800
        doc.roundedRect(margins, cursorY, contentWidth, 8, 4, 4, 'F');
        // Progress Bar Fill
        if (project.progress > 0) {
            doc.setFillColor(59, 130, 246); // Blue-500
            doc.roundedRect(margins, cursorY, (contentWidth * (project.progress / 100)), 8, 4, 4, 'F');
        }

        cursorY += 15;
        doc.setFontSize(10);
        doc.setTextColor(COLORS.textMuted);
        doc.setFont('helvetica', 'normal');
        doc.text(`Etapa Atual: ${STAGE_NAMES[project.progress]}`, margins, cursorY);

        // --- Key Metrics Grid (4 cards) ---
        cursorY += 20;
        const cardGap = 5;
        const cardWidth = (contentWidth - (cardGap * 3)) / 4;
        const cardHeight = 35;

        // 1. Total Units
        drawCard(doc, margins, cursorY, cardWidth, cardHeight, metrics.totalUnits.toString(), 'Unidades', COLORS.blue);
        // 2. Sold Units
        drawCard(doc, margins + cardWidth + cardGap, cursorY, cardWidth, cardHeight, metrics.soldUnits.toString(), 'Vendidas', COLORS.green);
        // 3. Available Units
        drawCard(doc, margins + (cardWidth + cardGap) * 2, cursorY, cardWidth, cardHeight, metrics.availableUnits.toString(), 'Disponíveis', COLORS.cyan);
        // 4. Total Sold Value
        const soldTxt = metrics.totalSold > 0 ? `R$ ${(metrics.totalSold / 1000).toFixed(0)}k` : '--';
        drawCard(doc, margins + (cardWidth + cardGap) * 3, cursorY, cardWidth, cardHeight, soldTxt, 'Vendido', COLORS.amber);

        // --- Financial Health Section ---
        cursorY += cardHeight + 15;

        // Section Title
        doc.setFontSize(12);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Saúde Financeira', margins, cursorY);

        cursorY += 8;
        // 1. Lucro Real (New)
        const realProfitTxt = formatCurrencyFull(metrics.realProfit);
        drawCard(doc, margins, cursorY, cardWidth, cardHeight, realProfitTxt, 'Lucro Real', COLORS.blue);

        // 2. Lucro Estimado (New)
        const estProfitTxt = formatCurrencyFull(metrics.estimatedGrossProfit);
        drawCard(doc, margins + cardWidth + cardGap, cursorY, cardWidth, cardHeight, estProfitTxt, 'Lucro Estimado', COLORS.cyan);

        // 3. Potencial
        const potTxt = metrics.potentialSales > 0 ? formatCurrencyFull(metrics.potentialSales) : 'VENDIDO';
        drawCard(doc, margins + (cardWidth + cardGap) * 2, cursorY, cardWidth, cardHeight, potTxt, metrics.potentialSales > 0 ? 'Potencial' : 'Status', COLORS.orange);

        // 4. Margem Média (ROI Real - Custom Card with IPCA)
        {
            const x = margins + (cardWidth + cardGap) * 3;
            const y = cursorY;
            const w = cardWidth;
            const h = cardHeight;
            const realRoiTxt = metrics.realMonthlyMargin ? `${metrics.realMonthlyMargin.toFixed(1)}%` : '--';
            const nominalRoiTxt = metrics.monthlyMargin ? `${metrics.monthlyMargin.toFixed(1)}%` : '';
            const ipcaTxt = `-${(metrics.inflationRate * 100).toFixed(1)}% IPCA`;

            // Draw Card Background
            doc.setFillColor(30, 41, 59); // Slate-800
            doc.setDrawColor(51, 65, 85); // Slate-700
            doc.roundedRect(x, y, w, h, 3, 3, 'FD');

            // Draw Value (Real ROI) - Moved slightly up
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(COLORS.green);
            doc.text(realRoiTxt, x + (w / 2), y + (h / 2) - 5, { align: 'center' });

            // Draw Detail Row (Nominal + Badge)
            if (nominalRoiTxt) {
                // Nominal (Grey)
                doc.setFontSize(8);
                doc.setTextColor(COLORS.textMuted);
                doc.text(nominalRoiTxt, x + (w / 2) - 8, y + (h / 2) + 2, { align: 'center' });

                // IPCA Badge (Red)
                const badgeW = doc.getTextWidth(ipcaTxt) + 4;
                const badgeH = 4;
                const badgeX = x + (w / 2) + 1; // Offset right
                const badgeY = y + (h / 2) - 1;

                doc.setFillColor(248, 113, 113, 0.2); // Red-400 with opacity simulation (solid color approximation for PDF: darker red bg)
                // Actually PDF doesn't support alpha in setFillColor easily without extended API.
                // We'll use a very dark red color to simulate "bg-red-500/10" on dark bg.
                doc.setFillColor(50, 20, 20);
                doc.setDrawColor(127, 29, 29); // Red-900 border
                doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'FD');

                doc.setTextColor(COLORS.red);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.text(ipcaTxt, badgeX + (badgeW / 2), badgeY + 3, { align: 'center' });
            }

            // Label
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(COLORS.textMuted);
            doc.text('ROI REAL (A.M.)', x + (w / 2), y + h - 4, { align: 'center' });
        }


        // --- Budget Detail (Macros) ---
        cursorY += cardHeight + 15;

        if (project.budget && project.budget.macros && project.budget.macros.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(COLORS.text);
            doc.setFont('helvetica', 'bold');
            doc.text('Execução do Orçamento', margins, cursorY);
            cursorY += 10;

            const macros = project.budget.macros.sort((a, b) => a.displayOrder - b.displayOrder);

            for (const macro of macros) {
                // Check page break
                if (cursorY > pageHeight - 30) {
                    doc.addPage();
                    setDarkBg();
                    cursorY = 20;
                }

                const percent = macro.estimatedValue > 0 ? (macro.spentValue / macro.estimatedValue) * 100 : 0;
                const isOver = percent > 100;

                // Label
                doc.setFontSize(9);
                doc.setTextColor(COLORS.text);
                doc.setFont('helvetica', 'bold');
                doc.text(macro.name, margins, cursorY);

                // Values (Right aligned)
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(COLORS.textMuted);
                const valText = `${formatCurrency(macro.spentValue)} / ${formatCurrency(macro.estimatedValue)}`;
                doc.text(valText, pageWidth - margins, cursorY, { align: 'right' });

                cursorY += 2;
                // Bar Background
                doc.setFillColor(30, 41, 59);
                doc.roundedRect(margins, cursorY, contentWidth, 4, 1, 1, 'F');

                // Bar Foreground
                doc.setFillColor(isOver ? COLORS.red : COLORS.blue);
                doc.roundedRect(margins, cursorY, Math.min(percent, 100) * (contentWidth / 100), 4, 1, 1, 'F');

                // Percent
                doc.setFontSize(8);
                doc.setTextColor(isOver ? COLORS.red : COLORS.green);
                doc.text(`${percent.toFixed(0)}%`, pageWidth - margins - doc.getTextWidth(valText) - 5, cursorY - 2, { align: 'right' });

                cursorY += 12;
            }
        } else {
            doc.setFontSize(10);
            doc.setTextColor(COLORS.textMuted);
            doc.text('Orçamento não disponível para visualização.', margins, cursorY + 5);
            cursorY += 10;
        }

        // --- Expenses Table (Full) ---
        cursorY += 10;
        if (cursorY > pageHeight - 40) {
            doc.addPage();
            setDarkBg();
            cursorY = 20;
        }

        doc.setFontSize(12);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Extrato de Despesas', margins, cursorY);
        cursorY += 5;

        const allExpenses = [...project.expenses]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(e => [
                formatDate(e.date),
                e.description,
                formatCurrency(e.value)
            ]);

        if (allExpenses.length > 0) {
            autoTable(doc, {
                startY: cursorY,
                head: [['Data', 'Descrição', 'Valor']],
                body: allExpenses,
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], lineColor: [51, 65, 85] },
                bodyStyles: { fillColor: [15, 23, 42], textColor: [200, 200, 200], lineColor: [51, 65, 85] },
                alternateRowStyles: { fillColor: [20, 28, 48] }, // Slightly lighter dark
                styles: { fontSize: 8, cellPadding: 3 },
                columnStyles: {
                    0: { cellWidth: 30 },
                    2: { cellWidth: 40, halign: 'right' }
                },
                margin: { left: margins, right: margins }
            });
            cursorY = (doc as any).lastAutoTable.finalY + 15;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(COLORS.textMuted);
            doc.text('Nenhuma despesa registrada.', margins, cursorY + 5);
            cursorY += 10;
        }

        // --- Timeline (New Page) ---
        doc.addPage();
        setDarkBg();
        let timelineY = 20;

        doc.setFontSize(16);
        doc.setTextColor(COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.text('Linha do Tempo Visual', margins, timelineY);
        timelineY += 15;

        // Draw Vertical Line
        const lineX = margins + 10;
        doc.setDrawColor(COLORS.cardBorder);
        doc.setLineWidth(1);
        doc.line(lineX, timelineY, lineX, pageHeight - 20);

        const stages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

        for (const stage of stages) {
            // Check Page Break inside loop
            if (timelineY > pageHeight - 50) {
                doc.addPage();
                setDarkBg();
                timelineY = 20;
                // Redraw Line header
                doc.setDrawColor(COLORS.cardBorder);
                doc.line(lineX, 0, lineX, pageHeight - 20);
            }

            const isCompleted = project.progress >= stage;
            const evidence = project.stageEvidence?.find(e => e.stage === stage);
            const stageName = STAGE_NAMES[stage];
            const hasPhoto = evidence?.photos && evidence.photos.length > 0;

            // Dot
            doc.setFillColor(isCompleted ? COLORS.blue : COLORS.cardBg);
            doc.setDrawColor(isCompleted ? COLORS.blue : COLORS.cardBorder);
            doc.circle(lineX, timelineY + 2, 3, 'FD');

            // Text
            doc.setFontSize(10);
            doc.setTextColor(isCompleted ? COLORS.text : COLORS.textMuted);
            doc.setFont('helvetica', 'bold');
            doc.text(stageName, lineX + 15, timelineY + 3);

            if (evidence?.date) {
                doc.setFontSize(8);
                doc.setTextColor(COLORS.textMuted);
                doc.setFont('helvetica', 'normal');
                doc.text(formatDate(evidence.date), lineX + 15 + doc.getTextWidth(stageName) + 5, timelineY + 3);
            }

            timelineY += 8;

            // Photo / Note
            if (hasPhoto && evidence.photos[0]) {
                const imgWidth = 50;
                const imgHeight = 35;

                // Ensure space
                if (timelineY + imgHeight > pageHeight - 20) {
                    doc.addPage();
                    setDarkBg();
                    timelineY = 20;
                    doc.setDrawColor(COLORS.cardBorder);
                    doc.line(lineX, 0, lineX, pageHeight - 20);
                }

                try {
                    // Load Image via Signed URL
                    const signedUrl = await getPhotoUrl(evidence.photos[0]);

                    if (signedUrl) {
                        const imgData = await loadImage(signedUrl);

                        // Draw Image
                        doc.addImage(imgData, 'JPEG', lineX + 15, timelineY, imgWidth, imgHeight);

                        // Border for photo
                        doc.setDrawColor(COLORS.cardBorder);
                        doc.rect(lineX + 15, timelineY, imgWidth, imgHeight);

                        timelineY += imgHeight + 5;
                    }
                } catch (err) {
                    console.warn('Error loading PDF image', err);
                    doc.setFontSize(8);
                    doc.setTextColor(COLORS.red);
                    doc.text('[Erro ao carregar imagem]', lineX + 15, timelineY + 5);
                    timelineY += 10;
                }
            }

            if (evidence?.notes) {
                const splitNotes = doc.splitTextToSize(evidence.notes, contentWidth - 40);
                doc.setFontSize(9);
                doc.setTextColor(COLORS.textMuted);
                doc.setFont('helvetica', 'italic');
                doc.text(splitNotes, lineX + 15, timelineY + 4);
                timelineY += (splitNotes.length * 4) + 5;
            } else if (!hasPhoto) {
                timelineY += 5; // Minimal spacing if empty
            }

            timelineY += 10; // Gap between stages
        }

        // --- Footer with Page Numbers (Valid for all pages) ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(COLORS.textMuted);
            doc.text(`Página ${i} de ${pageCount}`, pageWidth - margins, pageHeight - 10, { align: 'right' });
            doc.text('Obra Pro - Portal do Investidor', margins, pageHeight - 10);
        }

        doc.save(`Relatorio_${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (e: any) {
        console.error('CRITICAL PDF ERROR:', e);
        alert('Erro crítico ao gerar PDF: ' + e.message);
        throw e;
    }
};
