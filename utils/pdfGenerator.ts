
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, STAGE_NAMES } from '../types';
import { supabase } from '../supabaseClient';
import { calculateFinancialMetrics, calculateAverageMetrics } from './financials';

// ============================================================================
// IMAGE HELPERS
// ============================================================================

const getPhotoUrl = async (path: string): Promise<string | null> => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
    try {
        const { data } = await supabase.storage.from('project-documents').createSignedUrl(path, 3600);
        return data?.signedUrl || null;
    } catch { return null; }
};

const loadImage = (url: string, targetRatio?: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('No ctx'));

            const imgRatio = img.width / img.height;
            const finalRatio = targetRatio || imgRatio;
            let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

            if (finalRatio < imgRatio) {
                // Target is taller -> crop sides
                sWidth = img.height * finalRatio;
                sx = (img.width - sWidth) / 2;
            } else if (finalRatio > imgRatio) {
                // Target is wider -> crop top/bottom
                sHeight = img.width / finalRatio;
                sy = (img.height - sHeight) / 2;
            }

            const outW = 400; // max width for quality vs size balance
            const outH = Math.round(outW / finalRatio);

            canvas.width = outW;
            canvas.height = outH;
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
            resolve(canvas.toDataURL('image/jpeg', 0.8)); // 0.8 good quality
        };
        img.onerror = (e) => reject(e);
    });
};

// ============================================================================
// THEME COLORS
// ============================================================================

const BG: [number, number, number] = [15, 23, 42];
const CARD: [number, number, number] = [30, 41, 59];
const BORDER: [number, number, number] = [51, 65, 85];

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const C = {
    blue: '#3b82f6', cyan: '#22d3ee', green: '#4ade80', emerald: '#10b981',
    red: '#f87171', amber: '#fbbf24', purple: '#c084fc', orange: '#fb923c',
    text: '#ffffff', muted: '#94a3b8', muted2: '#64748b'
};

// ============================================================================
// FORMATTING
// ============================================================================

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);

const fmtShort = (v: number): string => {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 10_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
    return fmt(v);
};

const fmtDate = (d: string) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

// ============================================================================
// DRAW HELPERS
// ============================================================================

const card = (doc: any, x: number, y: number, w: number, h: number, border?: string) => {
    doc.setFillColor(...CARD);
    doc.setDrawColor(...(border ? hex(border) : BORDER));
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
};

const bar = (doc: any, x: number, y: number, w: number, h: number, pct: number, color: string) => {
    doc.setFillColor(...BORDER);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
    if (pct > 0) { doc.setFillColor(...hex(color)); doc.roundedRect(x, y, Math.min(pct, 100) * (w / 100), h, h / 2, h / 2, 'F'); }
};

// ============================================================================
// METRICS
// ============================================================================

const calcMetrics = (project: Project, inflationRate: number) => {
    const sold = project.units.filter(u => u.status === 'Sold');
    const avail = project.units.filter(u => u.status === 'Available');
    const totalCost = project.units.reduce((s, u) => s + u.cost, 0);
    const totalExp = project.expenses.reduce((s, e) => s + e.value, 0);
    const usage = totalCost > 0 ? (totalExp / totalCost) * 100 : 0;
    const totalSold = sold.reduce((s, u) => s + (u.saleValue || 0), 0);
    const estSales = project.units.reduce((s, u) => s + (u.valorEstimadoVenda || 0), 0);
    const estProfit = estSales - totalCost;
    const potential = avail.reduce((s, u) => s + (u.valorEstimadoVenda || 0), 0);
    const done = project.progress === 100;
    const area = project.units.reduce((s, u) => s + u.area, 0);

    const realProfit = sold.reduce((a, u) => {
        let cb = u.cost;
        if (done && area > 0) cb = (u.area / area) * totalExp;
        return (u.saleValue && u.saleValue > 0) ? a + (u.saleValue - cb) : a;
    }, 0);

    const first = project.expenses.length > 0 ? project.expenses.reduce((m, e) => e.date < m.date ? e : m, project.expenses[0]) : null;
    const ml = sold.map(u => {
        if (u.saleValue && u.saleValue > 0) {
            let cb = u.cost;
            if (done && area > 0) cb = (u.area / area) * totalExp;
            if (cb > 0) {
                let mo = 0;
                if (u.saleDate && first) { const s = new Date(first.date), e = new Date(u.saleDate); mo = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30))); }
                return calculateFinancialMetrics(u.saleValue - cb, cb, mo, inflationRate);
            }
        }
        return null;
    }).filter(Boolean) as any[];
    const avg = calculateAverageMetrics(ml);

    return {
        total: project.units.length, sold: sold.length, avail: avail.length,
        totalCost, totalExp, usage, totalSold, potential,
        realProfit, estProfit,
        monthlyRoi: avg ? avg.nominalMonthlyRoi * 100 : 0,
        realRoi: avg ? avg.realMonthlyRoi * 100 : 0,
        inflationRate
    };
};

// ============================================================================
// FETCH DATA
// ============================================================================

const fetchData = async (id: string) => {
    const { data: p, error } = await supabase.from('projects').select('*').eq('id', id).single();
    if (error || !p) throw new Error('Projeto não encontrado');
    const { data: units } = await supabase.from('units').select('*').eq('project_id', id);
    const { data: exps } = await supabase.from('expenses').select('*').eq('project_id', id);
    const { data: evs } = await supabase.from('stage_evidences').select('*').eq('project_id', id);
    const { data: bud } = await supabase.from('project_budgets')
        .select(`*, macros:project_macros (*, subMacros:project_sub_macros (*))`)
        .eq('project_id', id).maybeSingle();

    return {
        id: p.id, name: p.name, startDate: p.start_date, deliveryDate: p.delivery_date,
        unitCount: p.unit_count || 0, totalArea: p.total_area || 0,
        progress: p.progress || 0, expectedTotalCost: p.expected_total_cost || 0,
        expectedTotalSales: p.expected_total_sales || 0,
        units: (units || []).map((u: any) => ({ id: u.id, identifier: u.identifier, area: u.area, cost: u.cost, status: u.status, valorEstimadoVenda: u.valor_estimado_venda, saleValue: u.sale_value, saleDate: u.sale_date })),
        expenses: (exps || []).map((e: any) => ({ id: e.id, description: e.description, value: e.value, date: e.date, userId: e.user_id, userName: e.user_name, macroId: e.macro_id, subMacroId: e.sub_macro_id, attachmentUrl: e.attachment_url, attachments: e.attachments || [] })),
        stageEvidence: (evs || []).map((e: any) => ({ stage: e.stage, photos: e.photos || [], date: e.date, notes: e.notes, user: e.user_name })),
        logs: [], documents: [], diary: [],
        budget: bud ? {
            id: bud.id, projectId: bud.project_id, totalEstimated: bud.total_estimated || 0, totalValue: bud.total_value,
            macros: (bud.macros || []).map((m: any) => ({
                id: m.id, budgetId: m.budget_id, name: m.name, percentage: m.percentage,
                estimatedValue: m.estimated_value, spentValue: m.spent_value || 0, displayOrder: m.display_order,
                subMacros: (m.subMacros || []).map((s: any) => ({
                    id: s.id, projectMacroId: s.project_macro_id, name: s.name, percentage: s.percentage,
                    estimatedValue: s.estimated_value, spentValue: s.spent_value || 0, displayOrder: s.display_order
                }))
            }))
        } : undefined
    } as Project;
};

// ============================================================================
// MAIN PDF GENERATOR
// ============================================================================

export const generateProjectPDF = async (projectPartial: Project, userName: string, inflationRateOverride?: number) => {
    try {
        const project = await fetchData(projectPartial.id);
        const doc = new jsPDF() as any;
        const pw = doc.internal.pageSize.width;
        const ph = doc.internal.pageSize.height;
        const M = 14; // margin
        const W = pw - M * 2; // content width
        const today = new Date().toLocaleDateString('pt-BR');

        let iRate = 0.005;
        if (typeof inflationRateOverride === 'number') iRate = inflationRateOverride;
        else { const { data } = await supabase.from('inflation_rates').select('rate').order('month', { ascending: false }).limit(1).single(); iRate = data?.rate || 0.005; }

        const mt = calcMetrics(project, iRate);

        const darkBg = () => { doc.setFillColor(...BG); doc.rect(0, 0, pw, ph, 'F'); };

        // Track base addPage to inject dark background
        const originalAddPage = doc.addPage.bind(doc);
        doc.addPage = function() {
            originalAddPage(...arguments);
            darkBg();
            return doc;
        };

        const pageBreak = (need: number, y: number) => { if (y + need > ph - 15) { doc.addPage(); return 18; } return y; };
        const setColor = (c: string) => { const [r, g, b] = hex(c); doc.setTextColor(r, g, b); };

        // ══════════════════════════════════════════════════════════
        // PAGE 1
        // ══════════════════════════════════════════════════════════
        darkBg(); // First page bg

        // ── HEADER ──
        // Badge
        doc.setFillColor(...hex(C.blue));
        doc.roundedRect(M, 10, 50, 6, 3, 3, 'F');
        doc.setFontSize(6.5); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
        doc.text('PORTAL DO INVESTIDOR', M + 25, 14.2, { align: 'center' });

        // Title
        doc.setFontSize(18); doc.setTextColor(C.text); doc.text(project.name.toUpperCase(), M, 26);

        // Dates
        doc.setFontSize(8); setColor(C.muted);
        let dl = '';
        if (project.startDate) dl += `Início: ${fmtDate(project.startDate)}`;
        if (project.startDate && project.deliveryDate) dl += '  •  ';
        if (project.deliveryDate) dl += `Entrega: ${fmtDate(project.deliveryDate)}`;
        doc.text(dl, M, 32);

        // Right
        doc.text(`Gerado: ${today}  •  Por: ${userName}`, pw - M, 14, { align: 'right' });

        let y = 38;

        // ── HERO PHOTO ──
        const latestEv = (project.stageEvidence || []).filter(e => e.photos?.length > 0).sort((a, b) => b.stage - a.stage)[0];
        if (latestEv?.photos?.[0]) {
            try {
                const imgH = 50;
                const targetRatio = (W - 1) / (imgH - 1);
                const url = await getPhotoUrl(latestEv.photos[0]);
                if (url) {
                    const imgData = await loadImage(url, targetRatio);
                    doc.setDrawColor(...BORDER);
                    doc.roundedRect(M, y, W, imgH, 3, 3, 'S');
                    doc.addImage(imgData, 'JPEG', M + 0.5, y + 0.5, W - 1, imgH - 1);
                    // Dark overlay bar at bottom of photo
                    doc.setFillColor(10, 15, 30);
                    doc.rect(M + 0.5, y + imgH - 13, W - 1, 12.5, 'F');
                    doc.setFontSize(9); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
                    doc.text(STAGE_NAMES[latestEv.stage] || '', M + 5, y + imgH - 4);
                    if (latestEv.date) { doc.setFontSize(7); setColor(C.muted); doc.text(`Foto: ${fmtDate(latestEv.date)}`, pw - M - 5, y + imgH - 4, { align: 'right' }); }
                    y += imgH + 6;
                }
            } catch { /* skip */ }
        }

        // ── PROGRESS ──
        y = pageBreak(18, y);
        doc.setFontSize(11); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('Progresso Geral', M, y);
        doc.setFontSize(16); setColor(C.blue); doc.text(`${project.progress}%`, pw - M, y, { align: 'right' });
        y += 4;
        bar(doc, M, y, W, 5, project.progress, C.blue);
        y += 8;
        doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'normal');
        doc.text(`Etapa: ${STAGE_NAMES[project.progress] || 'N/A'}`, M, y);
        y += 10;

        // ══════════════════════════════════════════════════════════
        // VENDAS & LUCRO
        // ══════════════════════════════════════════════════════════
        y = pageBreak(55, y);

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('VENDAS & LUCRO', M, y);
        // Small badge right
        card(doc, pw - M - 38, y - 4.5, 38, 6);
        doc.setFontSize(6); setColor(C.muted); doc.text('Visão do Investidor', pw - M - 19, y - 0.5, { align: 'center' });
        y += 6;

        // TOP ROW: Und. Vendidas + Total Liquidado
        const c1W = W * 0.35, c2W = W * 0.62, gap = W * 0.03;
        const topH = 28;

        // Card: Und. Vendidas
        card(doc, M, y, c1W, topH);
        doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'bold');
        doc.text('UND. VENDIDAS', M + 3, y + 5);
        const pct = Math.round((mt.sold / (mt.total || 1)) * 100);
        doc.setFontSize(13); doc.setTextColor(C.text);
        doc.text(`${pct}%`, M + 6, y + 15);
        doc.setFontSize(18); doc.text(`${mt.sold}`, M + c1W / 2 + 4, y + 15);
        doc.setFontSize(11); setColor(C.muted2); doc.text(`/${mt.total}`, M + c1W / 2 + 4 + doc.getTextWidth(`${mt.sold}`), y + 15);
        doc.setFontSize(6); setColor(C.blue); doc.text('METAS', M + c1W / 2 + 4, y + 21);

        // Card: Total Liquidado
        card(doc, M + c1W + gap, y, c2W, topH, C.emerald);
        doc.setFontSize(7); setColor(C.emerald); doc.setFont('helvetica', 'bold');
        doc.text('TOTAL LIQUIDADO', M + c1W + gap + 4, y + 6);
        doc.setFontSize(16); doc.setTextColor(C.text);
        doc.text(fmtShort(mt.totalSold), M + c1W + gap + 4, y + 17);
        doc.setFontSize(6); setColor(C.muted); doc.text('Contratos validados', M + c1W + gap + 4, y + 23);
        y += topH + 4;

        // BOTTOM ROW: 4 compact cards
        y = pageBreak(24, y);
        const sW = (W - 9) / 4, sH = 22, sG = 3;

        const specs = [
            { lbl: 'LUCRO REAL', val: fmtShort(mt.realProfit), bdg: 'Real', bc: C.blue, brd: C.blue },
            { lbl: 'LUCRO PROJ.', val: fmtShort(mt.estProfit), bdg: 'Est.', bc: C.muted2, brd: C.cyan },
            { lbl: 'POTENCIAL', val: mt.potential > 0 ? fmtShort(mt.potential) : 'VENDIDO', bdg: mt.potential > 0 ? '' : 'Esgotado', bc: C.orange, brd: C.orange },
            { lbl: 'ROI REAL (A.M.)', val: `${(mt.realRoi || 0).toFixed(1)}%`, bdg: '', bc: '', brd: C.purple }
        ];

        specs.forEach((s, i) => {
            const x = M + i * (sW + sG);
            card(doc, x, y, sW, sH, s.brd);

            // Badge
            if (s.bdg) {
                doc.setFillColor(...hex(s.bc));
                const bw = doc.getTextWidth(s.bdg) + 5;
                doc.roundedRect(x + sW - bw - 2, y + 1.5, bw, 4.5, 2, 2, 'F');
                doc.setFontSize(5.5); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
                doc.text(s.bdg.toUpperCase(), x + sW - bw / 2 - 2, y + 4.5, { align: 'center' });
            }

            doc.setFontSize(5.5); setColor(C.muted); doc.setFont('helvetica', 'bold');
            doc.text(s.lbl, x + 3, y + 9);

            doc.setFontSize(10); doc.setTextColor(C.text);
            doc.text(s.val, x + 3, y + 17);

            // Extra ROI info
            if (i === 3) {
                doc.setFontSize(5); setColor(C.muted);
                doc.text(`Nom. ${(mt.monthlyRoi || 0).toFixed(1)}%  IPCA -${(mt.inflationRate * 100).toFixed(1)}%`, x + 3, y + 20.5);
            }
        });

        y += sH + 8;

        // ══════════════════════════════════════════════════════════
        // CONTROLE DE ORÇAMENTO
        // ══════════════════════════════════════════════════════════
        y = pageBreak(50, y);

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('CONTROLE DE ORÇAMENTO', M, y);

        // Badge usage
        const uc = mt.usage > 100 ? C.red : C.green;
        doc.setFillColor(...hex(uc));
        const ut = `${mt.usage.toFixed(0)}% usado`;
        const uw = doc.getTextWidth(ut) + 6;
        doc.roundedRect(pw - M - uw, y - 4, uw, 6, 3, 3, 'F');
        doc.setFontSize(6); doc.setTextColor(255, 255, 255); doc.text(ut, pw - M - uw / 2, y - 0.2, { align: 'center' });

        y += 6;

        // 3 Stats
        const stW = (W - 4) / 3, stH = 16;
        const stats3 = [
            { lbl: 'ORÇAMENTO', val: fmtShort(mt.totalCost), c: C.text },
            { lbl: 'GASTO', val: fmtShort(mt.totalExp), c: C.blue },
            { lbl: 'SALDO', val: fmtShort(mt.totalCost - mt.totalExp), c: (mt.totalCost - mt.totalExp) >= 0 ? C.green : C.red }
        ];
        stats3.forEach((s, i) => {
            const x = M + i * (stW + 2);
            card(doc, x, y, stW, stH);
            doc.setFontSize(5.5); setColor(C.muted); doc.setFont('helvetica', 'bold');
            doc.text(s.lbl, x + stW / 2, y + 5, { align: 'center' });
            doc.setFontSize(10); setColor(s.c);
            doc.text(s.val, x + stW / 2, y + 13, { align: 'center' });
        });

        y += stH + 3;
        bar(doc, M, y, W, 4, mt.usage, mt.usage > 100 ? C.red : C.green);
        y += 10;

        // Macros (SEM submacros - enxuto)
        if (project.budget?.macros?.length) {
            doc.setFontSize(7); setColor(C.muted2); doc.setFont('helvetica', 'bold');
            doc.text('POR CATEGORIA', M, y);
            y += 5;

            const macros = [...project.budget.macros].sort((a, b) => a.displayOrder - b.displayOrder);

            for (const macro of macros) {
                y = pageBreak(14, y);
                const p2 = macro.estimatedValue > 0 ? (macro.spentValue / macro.estimatedValue) * 100 : 0;
                const over = p2 > 100;

                // Name + percentage
                doc.setFontSize(8); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
                doc.text(macro.name, M + 2, y + 3);

                doc.setFontSize(7); setColor(over ? C.red : C.green);
                doc.text(`${p2.toFixed(0)}%`, pw - M - 2, y + 3, { align: 'right' });

                // Bar
                bar(doc, M + 2, y + 5.5, W - 4, 2, p2, over ? C.red : C.blue);

                // Values below bar
                doc.setFontSize(6); setColor(C.muted); doc.setFont('helvetica', 'normal');
                doc.text(`Gasto: ${fmtShort(macro.spentValue)}`, M + 2, y + 11);
                doc.text(`Meta: ${fmtShort(macro.estimatedValue)}`, pw - M - 2, y + 11, { align: 'right' });

                y += 14;
            }
        }

        // ══════════════════════════════════════════════════════════
        // EXTRATO DE DESPESAS
        // ══════════════════════════════════════════════════════════
        y += 4;
        y = pageBreak(30, y);

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('EXTRATO DE DESPESAS', M, y);
        y += 5;

        const expRows = [...project.expenses]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(e => {
                const att = !!(e.attachmentUrl || (e.attachments && e.attachments.length > 0));
                return [fmtDate(e.date), e.description || '-', att ? 'Sim' : '-', fmt(e.value)];
            });

        if (expRows.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Data', 'Descrição', 'Anexo', 'Valor']],
                body: expRows,
                theme: 'grid',
                headStyles: { fillColor: CARD, textColor: [255, 255, 255], lineColor: BORDER, fontSize: 7, fontStyle: 'bold' },
                bodyStyles: { fillColor: BG, textColor: [200, 200, 200], lineColor: BORDER, fontSize: 7 },
                alternateRowStyles: { fillColor: [20, 28, 48] },
                styles: { cellPadding: 2.5, font: 'helvetica', overflow: 'linebreak' },
                columnStyles: {
                    0: { cellWidth: 22 },
                    2: { cellWidth: 12, halign: 'center' },
                    3: { cellWidth: 30, halign: 'right' }
                },
                margin: { left: M, right: M }
            });
            y = (doc as any).lastAutoTable.finalY + 8;
        } else {
            doc.setFontSize(8); setColor(C.muted);
            doc.text('Nenhuma despesa registrada.', M, y + 5);
            y += 15;
        }

        // ══════════════════════════════════════════════════════════
        // CRONOGRAMA COMPACTO (sem ocupar muitas páginas)
        // ══════════════════════════════════════════════════════════
        y = pageBreak(40, y);
        // If not enough room, new page
        if (y > ph - 80) { doc.addPage(); y = 18; }

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('CRONOGRAMA DE ETAPAS', M, y);
        y += 8;

        const stages = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const lineX = M + 6;

        // Vertical line
        doc.setDrawColor(...BORDER); doc.setLineWidth(0.8);
        const lineStart = y;

        // Collect stage photos to load in parallel
        const stagePhotos: { [key: number]: string | null } = {};
        const photoPromises = stages.map(async (stage) => {
            const ev = project.stageEvidence?.find(e => e.stage === stage);
            if (ev?.photos?.[0]) {
                try {
                    const url = await getPhotoUrl(ev.photos[0]);
                    // Crop thumbnail horizontally or vertically to match aspect ratio precisely
                const thW = 30; const thH = 18;
                const ratio = thW / thH;
                if (url) stagePhotos[stage] = await loadImage(url, ratio);
                } catch { /* skip */ }
            }
        });
        await Promise.all(photoPromises);

        for (const stage of stages) {
            y = pageBreak(22, y);

            const done = project.progress >= stage;
            const ev = project.stageEvidence?.find(e => e.stage === stage);
            const hasImg = !!stagePhotos[stage];

            // Dot
            if (done) { doc.setFillColor(...hex(C.blue)); doc.setDrawColor(...hex(C.blue)); }
            else { doc.setFillColor(...CARD); doc.setDrawColor(...BORDER); }
            doc.circle(lineX, y + 2, 2.5, 'FD');

            // Stage Name
            doc.setFontSize(8.5); doc.setTextColor(done ? C.text : C.muted); doc.setFont('helvetica', 'bold');
            doc.text(STAGE_NAMES[stage] || `${stage}%`, lineX + 8, y + 3);

            // Date
            if (ev?.date) {
                const nameW = doc.getTextWidth(STAGE_NAMES[stage] || '');
                doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'normal');
                doc.text(fmtDate(ev.date), lineX + 8 + nameW + 4, y + 3);
            }

            // Small inline photo (compact: 28x18 thumbnail)
            if (hasImg) {
                const imgX = pw - M - 32;
                const imgW = 30, imgH = 18;
                try {
                    doc.setDrawColor(...BORDER);
                    doc.roundedRect(imgX, y - 3, imgW, imgH, 1.5, 1.5, 'S');
                    doc.addImage(stagePhotos[stage]!, 'JPEG', imgX + 0.3, y - 2.7, imgW - 0.6, imgH - 0.6);
                } catch { /* skip */ }
            }

            // Notes (truncated to 1 line)
            if (ev?.notes) {
                const maxW = hasImg ? W - 50 : W - 15;
                let note = ev.notes;
                if (doc.getTextWidth(note) > maxW) {
                    while (doc.getTextWidth(note + '...') > maxW && note.length > 0) note = note.slice(0, -1);
                    note += '...';
                }
                doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'italic');
                doc.text(note, lineX + 8, y + 8);
            }

            y += hasImg ? 18 : (ev?.notes ? 13 : 9);
        }

        // Draw the vertical line over everything
        for (let pg = 1; pg <= doc.internal.getNumberOfPages(); pg++) {
            // Lines are drawn per-stage above
        }

        // ══════════════════════════════════════════════════════════
        // FOOTER (all pages)
        // ══════════════════════════════════════════════════════════
        const pc = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pc; i++) {
            doc.setPage(i);
            doc.setFontSize(6.5); setColor(C.muted);
            doc.text(`Página ${i}/${pc}`, pw - M, ph - 6, { align: 'right' });
            doc.text('Obra Pro • Portal do Investidor', M, ph - 6);
        }

        doc.save(`Relatorio_${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (e: any) {
        console.error('PDF ERROR:', e);
        alert('Erro ao gerar PDF: ' + e.message);
        throw e;
    }
};
