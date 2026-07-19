import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Project } from '../types';
import { generateProjectPDF } from '../utils/pdfGenerator';
import { ReportOptions, DEFAULT_REPORT_OPTIONS, OPTIONAL_SECTIONS, PAID_SECTIONS, buildInvestorUrl, clampReportOptions } from '../utils/reportOptions';
import { usePlan } from './PlanProvider';

interface ShareReportModalProps {
    project: Project;
    userName: string;
    onClose: () => void;
}

// Modal único de compartilhamento: o usuário escolhe o que entra no relatório
// e a MESMA escolha vale para o link e para o PDF (ficam idênticos).
const ShareReportModal: React.FC<ShareReportModalProps> = ({ project, userName, onClose }) => {
    const { ent, openUpgrade } = usePlan();
    const [opts, setOpts] = useState<ReportOptions>(() =>
        clampReportOptions({ ...DEFAULT_REPORT_OPTIONS }, ent.canShareFullReport)
    );
    const [copied, setCopied] = useState(false);
    const [generating, setGenerating] = useState(false);

    const isPaidSection = (key: keyof ReportOptions) =>
        !ent.canShareFullReport && PAID_SECTIONS.includes(key);

    const toggle = (key: keyof ReportOptions) => {
        if (isPaidSection(key)) { openUpgrade('linkCompleto'); return; }
        setOpts(prev => ({ ...prev, [key]: !prev[key] }));
        setCopied(false);
    };

    const investorUrl = buildInvestorUrl(window.location.origin, window.location.pathname, project.id, opts);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(investorUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Fallback: seleciona o texto do input
            window.prompt('Copie o link do investidor:', investorUrl);
        }
    };

    const handlePdf = async () => {
        if (!ent.canExportPdf) { openUpgrade('pdf'); return; }
        if (generating) return;
        setGenerating(true);
        try {
            await generateProjectPDF(project, userName, opts);
        } catch (err) {
            console.error('Erro ao gerar PDF', err);
            alert('Erro ao gerar PDF. Tente novamente.');
        } finally {
            setGenerating(false);
        }
    };

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between p-6 border-b border-slate-800">
                    <div>
                        <h2 className="text-lg font-black text-white flex items-center gap-2">
                            <i className="fa-solid fa-share-nodes text-blue-400"></i>
                            Compartilhar relatório
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            Link e PDF mostram exatamente o mesmo. Escolha o que incluir.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
                        title="Fechar"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Seções opcionais */}
                <div className="p-6 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                        Seções do relatório
                    </p>
                    {OPTIONAL_SECTIONS.map(sec => {
                        const locked = isPaidSection(sec.key);
                        const on = opts[sec.key] && !locked;
                        return (
                            <button
                                key={sec.key}
                                onClick={() => toggle(sec.key)}
                                className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${on
                                    ? 'bg-blue-500/10 border-blue-500/40'
                                    : locked
                                        ? 'bg-slate-800/40 border-dashed border-slate-700 hover:border-amber-500/50'
                                        : 'bg-slate-800/40 border-slate-700 opacity-60'
                                    }`}
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-blue-500/20 text-blue-400' : locked ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-700/50 text-slate-500'}`}>
                                    <i className={`fa-solid ${locked ? 'fa-lock' : sec.icon}`}></i>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`font-bold text-sm ${locked ? 'text-slate-300' : 'text-white'}`}>{sec.label}</p>
                                    <p className="text-slate-400 text-xs truncate">
                                        {locked ? 'Faz parte do ObraPro' : sec.hint}
                                    </p>
                                </div>
                                {/* switch (no travado vira só a seta do convite) */}
                                {locked ? (
                                    <i className="fa-solid fa-chevron-right text-slate-600 text-xs shrink-0"></i>
                                ) : (
                                    <div className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? 'bg-blue-500' : 'bg-slate-600'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                    <p className="text-xs text-slate-500 pt-2">
                        <i className="fa-solid fa-circle-info mr-1.5"></i>
                        Gasto × Avanço, Orçamento por categoria e Caixa da obra aparecem sempre.
                    </p>
                    {!ent.canRemoveBranding && (
                        <p className="text-xs text-slate-500">
                            <i className="fa-solid fa-tag mr-1.5"></i>
                            O relatório vai com o selo "Feito com ObraPro".{' '}
                            <button onClick={() => openUpgrade('branding')} className="text-amber-400 font-bold hover:underline">
                                Tirar a marca
                            </button>
                        </p>
                    )}
                </div>

                {/* Ações */}
                <div className="p-6 border-t border-slate-800 space-y-3">
                    <div className="flex gap-3">
                        <button
                            onClick={handleCopy}
                            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <i className={`fa-solid ${copied ? 'fa-check' : 'fa-link'}`}></i>
                            {copied ? 'Link copiado!' : 'Copiar link'}
                        </button>
                        <button
                            onClick={handlePdf}
                            disabled={generating}
                            className={`flex-1 px-4 py-3 bg-slate-800 border text-white rounded-2xl font-bold transition-colors flex items-center justify-center gap-2 hover:bg-slate-700 ${generating ? 'opacity-50 cursor-not-allowed' : ''} ${ent.canExportPdf ? 'border-slate-600' : 'border-dashed border-slate-600 hover:border-amber-500/50'}`}
                        >
                            <i className={`fa-solid ${generating ? 'fa-spinner fa-spin text-red-400' : ent.canExportPdf ? 'fa-file-pdf text-red-400' : 'fa-lock text-amber-400'}`}></i>
                            {generating ? 'Gerando...' : 'Baixar PDF'}
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-500 break-all bg-slate-800/50 rounded-lg px-3 py-2 border border-slate-700/60">
                        {investorUrl}
                    </p>
                </div>
            </div>
        </div>,
        document.getElementById('modal-root') || document.body
    );
};

export default ShareReportModal;
