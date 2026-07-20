
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, getStageName, getCurrentStageEvidence } from '../types';
import { supabase } from '../supabaseClient';
import { computeProjectFinance, computeGastoAvancoVerdito, computeAporteShares } from './projectFinance';
import { daysSince, lastUpdatedLabel, mostRecentDate } from '../utils';
import { ReportOptions, DEFAULT_REPORT_OPTIONS } from './reportOptions';

// ============================================================================
// IMAGE HELPERS
// ============================================================================

const blobToDataUrl = (blob: Blob): Promise<string | null> =>
    new Promise((resolve) => {
        const fr = new FileReader();
        fr.onloadend = () => resolve(typeof fr.result === 'string' ? fr.result : null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
    });

// Baixa a imagem como data URL para desenhar no PDF.
// 1) Assina a URL (createSignedUrl — mesma via que o app usa p/ exibir a foto).
// 2) Baixa os bytes dessa URL (token público + CORS *) e converte em data URL,
//    evitando o canvas "tainted".
const getPhotoUrl = async (path: string): Promise<string | null> => {
    if (!path) return null;
    if (path.startsWith('data:')) return path;

    // 1) Obtém uma URL acessível
    let url = '';
    if (path.startsWith('http') || path.startsWith('blob:')) {
        url = path;
    } else {
        for (const bucket of ['project-documents', 'expense-attachments']) {
            try {
                const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
                if (error) { console.warn('[PDF] createSignedUrl falhou em', bucket, '->', error.message); continue; }
                if (data?.signedUrl) { url = data.signedUrl; break; }
            } catch (e) { console.warn('[PDF] createSignedUrl exceção em', bucket, e); }
        }
    }
    if (!url) { console.warn('[PDF] Não consegui assinar a foto:', path); return null; }

    // 2) Baixa os bytes e converte em data URL
    try {
        const resp = await fetch(url);
        if (!resp.ok) { console.warn('[PDF] fetch da foto retornou', resp.status); return null; }
        const blob = await resp.blob();
        return await blobToDataUrl(blob);
    } catch (e) {
        console.warn('[PDF] fetch da foto falhou:', e);
        return null;
    }
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
// (métricas vêm do computeProjectFinance — fonte única do app e do Portal)
// ============================================================================

// ============================================================================
// FETCH DATA
// ============================================================================

const fetchData = async (id: string) => {
    const { data: p, error } = await supabase.from('projects').select('*').eq('id', id).single();
    if (error || !p) throw new Error('Projeto não encontrado');
    const { data: units } = await supabase.from('units').select('*').eq('project_id', id);
    const { data: exps } = await supabase.from('expenses').select('*').eq('project_id', id);
    const { data: acqs } = await supabase.from('acquisition_costs').select('*').eq('project_id', id);
    const { data: evs } = await supabase.from('stage_evidences').select('*').eq('project_id', id);
    const { data: contribs } = await supabase.from('contributions').select('*').eq('project_id', id);
    const { data: invs } = await supabase.from('investors').select('*').eq('project_id', id);
    const { data: shares } = await supabase.from('profit_shares').select('*').eq('project_id', id);
    const { data: bud } = await supabase.from('project_budgets')
        .select(`*, macros:project_macros (*, subMacros:project_sub_macros (*))`)
        .eq('project_id', id).maybeSingle();

    return {
        id: p.id, name: p.name, startDate: p.start_date, deliveryDate: p.delivery_date,
        unitCount: p.unit_count || 0, totalArea: p.total_area || 0,
        progress: p.progress || 0, expectedTotalCost: p.expected_total_cost || 0,
        expectedTotalSales: p.expected_total_sales || 0,
        splitMode: (p.split_mode as 'percent' | 'unit') || 'percent',
        units: (units || []).map((u: any) => ({ id: u.id, identifier: u.identifier, area: u.area, cost: u.cost, status: u.status, valorEstimadoVenda: u.valor_estimado_venda, saleValue: u.sale_value, saleDate: u.sale_date, ownerInvestorId: u.owner_investor_id || undefined })),
        expenses: (exps || []).map((e: any) => ({ id: e.id, description: e.description, value: e.value, date: e.date, userId: e.user_id, userName: e.user_name, macroId: e.macro_id, subMacroId: e.sub_macro_id, attachmentUrl: e.attachment_url, attachments: e.attachments || [], paidByInvestorId: e.paid_by_investor_id || undefined })),
        acquisitionCosts: (acqs || []).map((a: any) => ({ id: a.id, projectId: a.project_id, category: a.category, description: a.description, value: a.value, date: a.date, paidFromProject: a.paid_from_project })),
        stageEvidence: (evs || []).map((e: any) => ({ stage: e.stage, photos: e.photos || [], date: e.date, notes: e.notes, user: e.user_name })),
        contributions: (contribs || []).map((c: any) => ({ id: c.id, projectId: c.project_id, investorId: c.investor_id, value: c.value, date: c.date })),
        investors: (invs || []).map((i: any) => ({ id: i.id, projectId: i.project_id, name: i.name })),
        profitShares: (shares || []).map((s: any) => ({ id: s.id, projectId: s.project_id, investorId: s.investor_id || undefined, name: s.name, percentage: s.percentage || 0, naoAporta: s.nao_aporta || false })),
        logs: [], documents: [], diary: [],
        budget: bud ? {
            id: bud.id, projectId: bud.project_id, totalEstimated: bud.total_estimated || 0, totalValue: bud.total_value,
            macros: (bud.macros || []).map((m: any) => ({
                id: m.id, budgetId: m.budget_id, name: m.name, percentage: m.percentage,
                estimatedValue: m.estimated_value, spentValue: m.spent_value || 0, displayOrder: m.display_order,
                // Igual ao app e ao link: canteiro fora da régua do avanço.
                timeBased: m.time_based || false,
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

export const generateProjectPDF = async (projectPartial: Project, userName: string, options: ReportOptions = DEFAULT_REPORT_OPTIONS) => {
    try {
        const project = await fetchData(projectPartial.id);
        const doc = new jsPDF() as any;
        const pw = doc.internal.pageSize.width;
        const ph = doc.internal.pageSize.height;
        const M = 14; // margin
        const W = pw - M * 2; // content width
        const today = new Date().toLocaleDateString('pt-BR');

        // Fonte única — mesmos números do app e do Portal do Investidor.
        const f = computeProjectFinance(project);
        const isCompleted = project.progress >= 100;
        const verdito = computeGastoAvancoVerdito(f);
        const toneHex = ({ neutral: C.muted2, warning: C.amber, good: C.emerald } as Record<string, string>)[verdito.tone];
        const invName = (id?: string) => (project.investors || []).find(i => i.id === id)?.name;
        const lastUpd = mostRecentDate([
            ...(project.expenses || []).map(e => e.date),
            ...(project.contributions || []).map(c => c.date),
            ...(project.stageEvidence || []).map(s => s.date),
        ]);
        let fotoShown = false;

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
        if (lastUpd) { doc.setFontSize(7); setColor(C.muted); doc.text(lastUpdatedLabel(daysSince(lastUpd)), pw - M, 18.5, { align: 'right' }); }

        let y = 38;

        // ── HERO PHOTO ──
        // Foto SÓ da etapa atual (sem foto na etapa atual => sem foto), igual ao link/app.
        const latestEv = getCurrentStageEvidence(project);
        if (latestEv?.photos?.[0] && options.foto) {
            try {
                const imgH = 100;
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
                    doc.text(getStageName(latestEv.stage, project) || '', M + 5, y + imgH - 4);
                    if (latestEv.date) { doc.setFontSize(7); setColor(C.muted); doc.text(`Foto: ${fmtDate(latestEv.date)}`, pw - M - 5, y + imgH - 4, { align: 'right' }); }
                    y += imgH + 6;
                    fotoShown = true;
                } else {
                    console.warn('[PDF] getPhotoUrl retornou vazio para', latestEv.photos[0]);
                }
            } catch (err) { console.warn('[PDF] Falha ao desenhar a foto:', err); }
        } else {
            console.warn('[PDF] Sem foto para o hero. options.foto=', options.foto, 'latestEv=', latestEv);
        }

        // ══════════════════════════════════════════════════════════
        // GASTO x AVANÇO (substitui o "Progresso Geral" — igual ao app)
        // ══════════════════════════════════════════════════════════
        y = pageBreak(30, y);
        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('GASTO x AVANÇO', M, y);
        doc.setFontSize(7); setColor(C.muted); doc.setFont('helvetica', 'normal');
        doc.text(`${f.gastoPct.toFixed(0)}% gasto  •  ${f.progresso.toFixed(0)}% obra`, pw - M, y, { align: 'right' });
        y += 4;
        // barra de gasto + marcador branco do avanço físico
        bar(doc, M, y, W, 5, f.gastoPct, toneHex);
        const markX = M + Math.min(f.progresso, 100) * (W / 100);
        doc.setFillColor(255, 255, 255);
        doc.rect(markX - 0.3, y - 1.2, 0.6, 7.4, 'F');
        y += 9;
        // veredito (esquerda) + "Gasto X de Y" (direita) — igual ao app
        doc.setFontSize(9); setColor(toneHex); doc.setFont('helvetica', 'bold');
        doc.text(verdito.texto, M, y);
        doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'normal');
        doc.text(`Gasto ${fmtShort(f.gasto)} de ${fmtShort(f.orcamentoObra)}`, pw - M, y, { align: 'right' });
        y += 6;
        // Etapa atual só quando a foto (que já mostra a etapa) não está no relatório
        if (!fotoShown) {
            doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'normal');
            doc.text(`Etapa atual: ${getStageName(project.progress, project) || 'N/A'}`, M, y);
            y += 6;
        }
        y += 4;

        // ══════════════════════════════════════════════════════════
        // ORÇAMENTO POR CATEGORIA (só a lista — a barra/totais já estão acima)
        // ══════════════════════════════════════════════════════════
        if (project.budget?.macros?.length) {
            y = pageBreak(24, y);
            doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
            doc.text('ORÇAMENTO POR CATEGORIA', M, y);
            y += 7;

            const macros = [...project.budget.macros].sort((a, b) => a.displayOrder - b.displayOrder);
            for (const macro of macros) {
                y = pageBreak(14, y);
                const p2 = macro.estimatedValue > 0 ? (macro.spentValue / macro.estimatedValue) * 100 : 0;
                const over = p2 > 100;

                doc.setFontSize(8); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
                doc.text(macro.name, M + 2, y + 3);
                doc.setFontSize(7); setColor(over ? C.red : C.green);
                doc.text(`${p2.toFixed(0)}%`, pw - M - 2, y + 3, { align: 'right' });

                bar(doc, M + 2, y + 5.5, W - 4, 2, p2, over ? C.red : C.blue);

                doc.setFontSize(6); setColor(C.muted); doc.setFont('helvetica', 'normal');
                doc.text(`Gasto: ${fmtShort(macro.spentValue)}`, M + 2, y + 11);
                doc.text(`Meta: ${fmtShort(macro.estimatedValue)}`, pw - M - 2, y + 11, { align: 'right' });
                y += 14;
            }
            y += 2;
        }

        // ══════════════════════════════════════════════════════════
        // ONDE FOI O DINHEIRO (itens que mais gastaram) — seção paga (itens).
        // Espelha o card do link; os nomes dos itens não vêm no objeto do
        // projeto, então são buscados aqui por project_id.
        // ══════════════════════════════════════════════════════════
        if (options.itens) {
            const byItem: Record<string, number> = {};
            for (const e of project.expenses) {
                const k = e.itemId || '__none__';
                byItem[k] = (byItem[k] || 0) + (e.value || 0);
            }
            const itemRows = Object.entries(byItem).sort((a, b) => b[1] - a[1]).slice(0, 8);
            if (itemRows.length > 0) {
                const itemsById: Record<string, string> = {};
                try {
                    const { data } = await supabase.from('project_items').select('id, name').eq('project_id', project.id);
                    (data || []).forEach((it: any) => { itemsById[it.id] = it.name; });
                } catch { /* sem nomes: cai no fallback 'Item' */ }

                y = pageBreak(16 + itemRows.length * 9, y);
                doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
                doc.text('ONDE FOI O DINHEIRO', M, y);
                y += 6;
                const maxItem = itemRows[0][1] || 1;
                for (const [itemId, total] of itemRows) {
                    y = pageBreak(9, y);
                    const nome = itemId === '__none__' ? 'Sem item' : (itemsById[itemId] || 'Item');
                    doc.setFontSize(7.5); setColor(C.text); doc.setFont('helvetica', 'bold');
                    doc.text(nome, M + 2, y + 3);
                    setColor(C.text);
                    doc.text(fmtShort(total), pw - M - 2, y + 3, { align: 'right' });
                    bar(doc, M + 2, y + 4.5, W - 4, 2, (total / maxItem) * 100, C.amber);
                    y += 9;
                }
                y += 3;
            }
        }

        // ══════════════════════════════════════════════════════════
        // CAIXA DA OBRA (Aportado - Gasto - Aquisição = Saldo)
        // ══════════════════════════════════════════════════════════
        // A aquisição entra como card (e na legenda) só quando foi paga PELA OBRA
        // — mesma regra do app e do link. Sem ela, a legenda prometia uma conta
        // que não fechava: o saldo desconta a aquisição, mas ela não aparecia.
        y = pageBreak(40, y);

        const temAquisicaoPaga = f.aquisicaoPaga > 0;
        const legendaCaixa = temAquisicaoPaga ? 'Aportado - Gasto - Aquisição = Saldo' : 'Aportado - Gasto = Saldo';

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('CAIXA DA OBRA', M, y);
        const legW = temAquisicaoPaga ? 60 : 46;
        card(doc, pw - M - legW, y - 4.5, legW, 6);
        doc.setFontSize(6); setColor(C.muted); doc.text(legendaCaixa, pw - M - legW / 2, y - 0.5, { align: 'center' });
        y += 6;

        const caixa = [
            { lbl: 'APORTADO', val: fmtShort(f.aportadoTotal), c: C.emerald, brd: C.emerald },
            { lbl: 'GASTO', val: fmtShort(f.gasto), c: C.red, brd: C.red },
            ...(temAquisicaoPaga
                ? [{ lbl: 'AQUISIÇÃO', val: fmtShort(f.aquisicaoPaga), c: C.amber, brd: C.amber }]
                : []),
            { lbl: 'SALDO EM CAIXA', val: fmtShort(f.saldoCaixa), c: f.saldoCaixa >= 0 ? C.green : C.red, brd: f.saldoCaixa >= 0 ? C.green : C.red },
        ];
        const cxW = (W - 4 * (caixa.length - 1)) / caixa.length, cxH = 22;
        caixa.forEach((s, i) => {
            const x = M + i * (cxW + 4);
            card(doc, x, y, cxW, cxH, s.brd);
            doc.setFontSize(6); setColor(C.muted); doc.setFont('helvetica', 'bold');
            doc.text(s.lbl, x + cxW / 2, y + 6, { align: 'center' });
            doc.setFontSize(12); setColor(s.c);
            doc.text(s.val, x + cxW / 2, y + 15, { align: 'center' });
        });
        y += cxH + 8;

        // ══════════════════════════════════════════════════════════
        // ACERTO DE APORTES (Meta · Aportou · Falta por sócio — fonte única do app).
        // Sem base de meta (sem % / sem casas com dono) → cai na lista simples
        // "Aportes por sócio" (nome + total), sem regressão.
        // ══════════════════════════════════════════════════════════
        if (options.aportes) {
            const acerto = computeAporteShares(project);

            if (acerto.semBase) {
                const aporteSocio = (project.investors || []).map(inv => {
                    const dinheiro = (project.contributions || []).filter(c => c.investorId === inv.id).reduce((s, c) => s + (c.value || 0), 0);
                    const bolso = (project.expenses || []).filter(e => e.paidByInvestorId === inv.id).reduce((s, e) => s + (e.value || 0), 0);
                    return { name: inv.name, total: dinheiro + bolso };
                }).filter(l => l.total > 0).sort((a, b) => b.total - a.total);

                if (aporteSocio.length > 0) {
                    y = pageBreak(18 + aporteSocio.length * 7, y);
                    doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
                    doc.text('APORTES POR SÓCIO', M, y);
                    y += 7;
                    const totalSocios = aporteSocio.reduce((s, l) => s + l.total, 0);
                    aporteSocio.forEach(l => {
                        doc.setFontSize(8); setColor(C.text); doc.setFont('helvetica', 'normal');
                        doc.text(l.name, M + 2, y);
                        doc.setFont('helvetica', 'bold'); setColor(C.emerald);
                        doc.text(fmt(l.total), pw - M - 2, y, { align: 'right' });
                        doc.setDrawColor(...BORDER); doc.setLineWidth(0.2); doc.line(M + 2, y + 2, pw - M - 2, y + 2);
                        y += 7;
                    });
                    doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'bold');
                    doc.text('Total aportado', M + 2, y + 1);
                    setColor(C.text); doc.setFontSize(9);
                    doc.text(fmt(totalSocios), pw - M - 2, y + 1, { align: 'right' });
                    y += 10;
                }
            } else {
                const shares = [...acerto.shares].sort((a, b) => b.meta - a.meta);
                const pctDe = (id?: string) => (project.profitShares || []).find(s => s.investorId === id)?.percentage;
                const donoUn = (id?: string) => (project.units || []).filter(u => u.ownerInvestorId === id).map(u => u.identifier).join(', ');
                const colW = (W - 4) / 3;

                y = pageBreak(18 + shares.length * 12, y);
                doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
                doc.text('ACERTO DE APORTES', M, y);
                doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'normal');
                doc.text(acerto.mode === 'unit' ? 'Divisão por casa' : 'Divisão por porcentagem', pw - M, y, { align: 'right' });
                y += 6;

                for (const s of shares) {
                    y = pageBreak(14, y);
                    // Nome + participação (%/casas)
                    doc.setFontSize(8); setColor(C.text); doc.setFont('helvetica', 'bold');
                    doc.text(s.name, M + 2, y);
                    const sub = acerto.mode === 'unit' ? donoUn(s.investorId) : `${pctDe(s.investorId) ?? 0}%`;
                    if (sub) { doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'normal'); doc.text(sub, pw - M - 2, y, { align: 'right' }); }
                    y += 5;
                    // Meta · Aportou · Falta
                    const faltaColor = s.falta > 0.5 ? C.amber : s.falta < -0.5 ? C.emerald : C.muted2;
                    const faltaTxt = s.falta > 0.5 ? fmtShort(s.falta) : s.falta < -0.5 ? `+${fmtShort(-s.falta)}` : 'Em dia';
                    const cells = [
                        { lbl: 'META', val: fmtShort(s.meta), c: C.text },
                        { lbl: 'APORTOU', val: fmtShort(s.aportado), c: C.emerald },
                        { lbl: 'FALTA', val: faltaTxt, c: faltaColor },
                    ];
                    cells.forEach((cell, i) => {
                        const x = M + 2 + i * colW;
                        doc.setFontSize(6); setColor(C.muted); doc.setFont('helvetica', 'bold');
                        doc.text(cell.lbl, x, y);
                        doc.setFontSize(8.5); setColor(cell.c); doc.setFont('helvetica', 'bold');
                        doc.text(cell.val, x, y + 4.5);
                    });
                    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2); doc.line(M + 2, y + 8, pw - M - 2, y + 8);
                    y += 12;
                }

                doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'bold');
                doc.text('Total aportado', M + 2, y + 1);
                setColor(C.text); doc.setFontSize(9);
                doc.text(fmt(acerto.totalAportado), pw - M - 2, y + 1, { align: 'right' });
                y += 6;
                if (acerto.totalFalta > 0.5) {
                    doc.setFontSize(7); setColor(C.amber); doc.setFont('helvetica', 'normal');
                    doc.text(`Falta aportar no total: ${fmt(acerto.totalFalta)}`, M + 2, y + 1);
                    y += 5;
                }
                y += 5;
            }
        }

        // ══════════════════════════════════════════════════════════
        // RESULTADO DO EMPREENDIMENTO (espelha o componente do app)
        // ══════════════════════════════════════════════════════════
        if (options.resultado) {
        y = pageBreak(58, y);

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('RESULTADO DO EMPREENDIMENTO', M, y);
        y += 6;

        const temProjecao = f.vendasEstimadasTotais > 0;
        const temVenda = f.unidadesVendidas > 0;
        const resW = (W - 4) / 2, resH = 44;
        const col2 = M + resW + 4;

        // Linha label/valor dentro de um card
        const resLine = (x: number, yy: number, w: number, label: string, val: string, valColor?: string, bold = false) => {
            doc.setFontSize(7); setColor(C.muted); doc.setFont('helvetica', 'normal');
            doc.text(label, x + 3, yy);
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            setColor(valColor || C.text);
            doc.text(val, x + w - 3, yy, { align: 'right' });
        };

        // --- PROJETADO (tudo vendido) ---
        card(doc, M, y, resW, resH, C.cyan);
        doc.setFontSize(7); setColor(C.cyan); doc.setFont('helvetica', 'bold');
        doc.text('PROJETADO (tudo vendido)', M + 3, y + 6);
        if (temProjecao) {
            resLine(M, y + 14, resW, 'Vendas estimadas', fmtShort(f.vendasEstimadasTotais));
            resLine(M, y + 20, resW, '- Obra (orçamento)', fmtShort(f.custoObraProjetado));
            if (f.terrenoProjetado > 0) resLine(M, y + 26, resW, '- Terreno', fmtShort(f.terrenoProjetado));
            const py = f.terrenoProjetado > 0 ? y + 35 : y + 29;
            doc.setDrawColor(...BORDER); doc.line(M + 3, py - 4, M + resW - 3, py - 4);
            resLine(M, py, resW, 'LUCRO PROJETADO', fmtShort(f.lucroProjetado), f.lucroProjetado >= 0 ? C.cyan : C.red, true);
            doc.setFontSize(6); setColor(C.muted); doc.setFont('helvetica', 'normal');
            doc.text(`margem ${f.margemPct.toFixed(1)}%`, M + resW - 3, py + 5, { align: 'right' });
        } else {
            doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'normal');
            doc.text('Sem projeção ainda', M + 3, y + 20);
            doc.setFontSize(6);
            doc.text('Defina o valor de venda das casas em Unidades.', M + 3, y + 26);
        }

        // --- REALIZADO (casas vendidas) ---
        card(doc, col2, y, resW, resH, isCompleted ? C.green : undefined);
        doc.setFontSize(7); setColor(C.emerald); doc.setFont('helvetica', 'bold');
        doc.text('REALIZADO (casas vendidas)', col2 + 3, y + 6);
        if (temVenda) {
            resLine(col2, y + 14, resW, 'Vendido', `${f.unidadesVendidas}/${f.unidadesTotais} casas`);
            resLine(col2, y + 20, resW, 'Liquidado', fmtShort(f.vendasRealizadas));
            if (isCompleted) {
                resLine(col2, y + 26, resW, '- Custo real', fmtShort(f.custoRealVendidas));
                doc.setDrawColor(...BORDER); doc.line(col2 + 3, y + 31, col2 + resW - 3, y + 31);
                resLine(col2, y + 37, resW, 'LUCRO REAL', fmtShort(f.lucroReal), f.lucroReal >= 0 ? C.green : C.red, true);
                doc.setFontSize(6); setColor(C.muted); doc.setFont('helvetica', 'normal');
                doc.text(`margem ${f.margemRealPct.toFixed(1)}%`, col2 + resW - 3, y + 42, { align: 'right' });
            } else {
                doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'italic');
                doc.text('Lucro real disponível ao concluir a obra', col2 + 3, y + 30);
            }
        } else {
            doc.setFontSize(8); setColor(C.muted); doc.setFont('helvetica', 'normal');
            doc.text('Nenhuma casa vendida ainda', col2 + 3, y + 20);
        }
        y += resH + 5;

        // A vender (mesma linha do componente do app)
        const disponiveis = f.unidadesTotais - f.unidadesVendidas;
        if (disponiveis > 0) {
            doc.setFontSize(6.5); setColor(C.muted); doc.setFont('helvetica', 'normal');
            doc.text(`A vender: ${fmtShort(f.vendasPotencial)}  •  ${disponiveis} casa${disponiveis > 1 ? 's' : ''} disponíve${disponiveis > 1 ? 'is' : 'l'}`, M, y);
            y += 6;
        }
        y += 3;
        } // fim options.resultado

        // ══════════════════════════════════════════════════════════
        // EXTRATO DE DESPESAS (com "Pago por")
        // ══════════════════════════════════════════════════════════
        if (options.despesas) {
        y += 4;
        y = pageBreak(30, y);

        doc.setFontSize(10); doc.setTextColor(C.text); doc.setFont('helvetica', 'bold');
        doc.text('EXTRATO DE DESPESAS', M, y);
        y += 5;

        const expRows = [...project.expenses]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(e => {
                const att = !!(e.attachmentUrl || (e.attachments && e.attachments.length > 0));
                const pagador = invName(e.paidByInvestorId) || 'Caixa da obra';
                return [fmtDate(e.date), e.description || '-', pagador, att ? 'Sim' : '-', fmt(e.value)];
            });

        if (expRows.length > 0) {
            autoTable(doc, {
                startY: y,
                head: [['Data', 'Descrição', 'Pago por', 'Anexo', 'Valor']],
                body: expRows,
                theme: 'grid',
                headStyles: { fillColor: CARD, textColor: [255, 255, 255], lineColor: BORDER, fontSize: 6.5, fontStyle: 'bold' },
                bodyStyles: { fillColor: BG, textColor: [200, 200, 200], lineColor: BORDER, fontSize: 6.5 },
                alternateRowStyles: { fillColor: [20, 28, 48] },
                styles: { cellPadding: 2, font: 'helvetica', overflow: 'linebreak' },
                columnStyles: {
                    0: { cellWidth: 20 },
                    2: { cellWidth: 32 },
                    3: { cellWidth: 12, halign: 'center' },
                    4: { cellWidth: 28, halign: 'right' }
                },
                margin: { left: M, right: M }
            });
            y = (doc as any).lastAutoTable.finalY + 8;
        } else {
            doc.setFontSize(8); setColor(C.muted);
            doc.text('Nenhuma despesa registrada.', M, y + 5);
            y += 15;
        }
        } // fim options.despesas

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
