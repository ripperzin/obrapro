import React, { useState } from 'react';
import { Project, User } from '../types';
import { exportProjectData } from '../utils/dataExport';
import { generateProjectPDF } from '../utils/pdfGenerator';
import { openAttachment } from '../utils/storage';
import { DEFAULT_REPORT_OPTIONS } from '../utils/reportOptions';

interface Props {
    projects: Project[];
    user: User;
}

/**
 * "Baixar meus dados" — portabilidade (LGPD). O cliente leva o que é dele:
 *  · Planilha (Excel) por obra: despesas, unidades, aportes, orçamento, diário.
 *  · Resumo em PDF (o mesmo relatório do app).
 *  · Documentos e fotos: lista com botão de baixar cada um.
 * Serve tanto na tela normal quanto na de conta suspensa (mesmo componente).
 */
const DataExportPanel: React.FC<Props> = ({ projects, user }) => {
    const [pdfBusy, setPdfBusy] = useState<string | null>(null);

    const baixarPdf = async (p: Project) => {
        setPdfBusy(p.id);
        try {
            await generateProjectPDF(p, user.login, DEFAULT_REPORT_OPTIONS);
        } catch (e: any) {
            alert('Não consegui gerar o PDF: ' + (e?.message || e));
        } finally {
            setPdfBusy(null);
        }
    };

    if (projects.length === 0) {
        return <p className="text-slate-400 text-sm">Você ainda não tem nenhuma obra para exportar.</p>;
    }

    return (
        <div className="space-y-4">
            {projects.map((p) => {
                const docs = p.documents || [];
                const fotos = (p.stageEvidence || []).flatMap((e) => (e.photos || []).map((url) => ({ url, stage: e.stage })));
                return (
                    <div key={p.id} className="glass rounded-2xl border border-slate-700 p-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                            <h4 className="text-white font-black truncate">{p.name}</h4>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => exportProjectData(p)}
                                    className="px-3 py-2 bg-emerald-600/20 border border-emerald-500/40 rounded-xl text-emerald-300 hover:bg-emerald-600/30 text-xs font-black"
                                >
                                    <i className="fa-solid fa-file-excel mr-1.5"></i> Planilha
                                </button>
                                <button
                                    onClick={() => baixarPdf(p)}
                                    disabled={pdfBusy === p.id}
                                    className="px-3 py-2 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-300 hover:bg-blue-600/30 text-xs font-black disabled:opacity-50"
                                >
                                    {pdfBusy === p.id ? <i className="fa-solid fa-spinner fa-spin mr-1.5"></i> : <i className="fa-solid fa-file-pdf mr-1.5"></i>} Resumo PDF
                                </button>
                            </div>
                        </div>

                        <p className="text-[11px] text-slate-500 mb-3">
                            A planilha traz despesas, unidades, aportes, orçamento e diário em abas separadas.
                        </p>

                        {/* Documentos */}
                        {docs.length > 0 && (
                            <div className="mb-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Documentos ({docs.length})</p>
                                <div className="flex flex-wrap gap-2">
                                    {docs.map((d) => (
                                        <button key={d.id} onClick={() => openAttachment(d.url, 'project-documents')}
                                            className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white text-xs font-bold">
                                            <i className="fa-solid fa-download mr-1.5 text-slate-500"></i>{d.title || 'documento'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Fotos da obra */}
                        {fotos.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Fotos da obra ({fotos.length})</p>
                                <div className="flex flex-wrap gap-2">
                                    {fotos.map((ft, i) => (
                                        <button key={i} onClick={() => openAttachment(ft.url, 'project-documents')}
                                            className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white text-xs font-bold">
                                            <i className="fa-solid fa-image mr-1.5 text-slate-500"></i>foto {i + 1}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {docs.length === 0 && fotos.length === 0 && (
                            <p className="text-[11px] text-slate-600">Nenhum documento ou foto anexado nesta obra.</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default DataExportPanel;
