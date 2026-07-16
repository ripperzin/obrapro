// Opções do relatório do investidor (link + PDF).
// O usuário escolhe o que entra no relatório antes de compartilhar/baixar.
// As mesmas opções valem para o LINK (codificadas na URL, ?off=...) e para o
// PDF (passadas direto para generateProjectPDF), então os dois ficam idênticos.

export interface ReportOptions {
    foto: boolean;       // foto da etapa atual (topo)
    resultado: boolean;  // Resultado do empreendimento
    aportes: boolean;    // Acerto de aportes (Meta/Aportou/Falta por sócio)
    despesas: boolean;   // Extrato detalhado de despesas
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
    foto: true,
    resultado: true,
    aportes: true,
    despesas: true,
};

// Seções que o usuário pode ligar/desligar (as demais — Gasto × Avanço,
// Orçamento por categoria e Caixa — são o núcleo e aparecem sempre).
export const OPTIONAL_SECTIONS: { key: keyof ReportOptions; label: string; hint: string; icon: string }[] = [
    { key: 'foto', label: 'Foto da etapa atual', hint: 'Imagem mais recente da obra no topo', icon: 'fa-image' },
    { key: 'resultado', label: 'Resultado do empreendimento', hint: 'Lucro projetado e realizado', icon: 'fa-sack-dollar' },
    { key: 'aportes', label: 'Acerto de aportes', hint: 'Meta, aportado e o que falta por sócio', icon: 'fa-users' },
    { key: 'despesas', label: 'Extrato de despesas', hint: 'Lista item a item, com quem pagou', icon: 'fa-receipt' },
];

// Seções que só existem no plano ObraPro. No Free o relatório é o NÚCLEO
// (foto + Gasto × Avanço + Orçamento por etapa + Caixa) e sai com a marca.
export const PAID_SECTIONS: (keyof ReportOptions)[] = ['resultado', 'despesas'];

/**
 * Corta do relatório o que o plano do dono não permite.
 * Chamado nos DOIS lados: no app (ao montar o link/PDF) e no portal público
 * (a partir do plano que a edge function devolve) — no portal é o que vale,
 * porque a URL é editável por quem receber o link.
 */
export const clampReportOptions = (opts: ReportOptions, canShareFullReport: boolean): ReportOptions => {
    if (canShareFullReport) return opts;
    const out = { ...opts };
    for (const k of PAID_SECTIONS) out[k] = false;
    return out;
};

// Lê as opções a partir do hash da URL (?off=despesas,resultado).
export const parseReportOptionsFromHash = (hash: string): ReportOptions => {
    const q = hash.split('?')[1] || '';
    const params = new URLSearchParams(q);
    const off = (params.get('off') || '').split(',').map((s) => s.trim()).filter(Boolean);
    return {
        foto: !off.includes('foto'),
        resultado: !off.includes('resultado'),
        aportes: !off.includes('aportes'),
        despesas: !off.includes('despesas'),
    };
};

// Monta a URL do Portal do Investidor com as opções desligadas codificadas.
export const buildInvestorUrl = (origin: string, pathname: string, projectId: string, opts: ReportOptions): string => {
    const off = (Object.keys(opts) as (keyof ReportOptions)[]).filter((k) => !opts[k]);
    const suffix = off.length ? `?off=${off.join(',')}` : '';
    return `${origin}${pathname}#/investor/${projectId}${suffix}`;
};
