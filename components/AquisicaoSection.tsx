import React, { useState } from 'react';
import { Project, User, ACQUISITION_CATEGORY_LABELS, AcquisitionCategory } from '../types';
import { formatCurrency } from '../utils';
import { openAttachment } from '../utils/storage';
import AddAcquisitionModal from './AddAcquisitionModal';
import { useDeleteAcquisitionCost } from '../hooks/useAquisicao';

interface Props {
    project: Project;
    user: User;
}

const AquisicaoSection: React.FC<Props> = ({ project, user }) => {
    const [showModal, setShowModal] = useState(false);
    const costs = [...(project.acquisitionCosts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const deleteCost = useDeleteAcquisitionCost();

    const total = costs.reduce((s, c) => s + (c.value || 0), 0);
    const catLabel = (c: string) => ACQUISITION_CATEGORY_LABELS[c as AcquisitionCategory] || c;
    const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '');

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="font-black text-white text-lg uppercase tracking-tight flex items-center gap-3">
                    <i className="fa-solid fa-map-location-dot text-amber-400"></i>
                    Terreno
                </h3>
                <button
                    onClick={() => setShowModal(true)}
                    className="bg-amber-600 text-white px-4 py-2.5 rounded-full font-black text-sm hover:bg-amber-700 transition shadow-lg shadow-amber-600/30 flex items-center gap-2"
                >
                    <i className="fa-solid fa-plus"></i> <span className="hidden sm:inline">Adicionar</span>
                </button>
            </div>

            <p className="text-[11px] text-slate-500">
                Terreno e custos iniciais (escritura, registro, impostos). Não entram no orçamento de obra nem no progresso — contam no caixa (quando pagos pela obra) e no custo total do empreendimento.
            </p>

            {costs.length === 0 ? (
                <p className="text-slate-500 text-sm">Nenhum custo de terreno lançado.</p>
            ) : (
                <>
                    {/* Card do total — mesmo padrão do "Total Desembolsado" das despesas */}
                    <div className="glass p-6 rounded-2xl border border-slate-700">
                        <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Total do Terreno</p>
                        <p className="text-3xl font-black text-amber-400">{formatCurrency(total)}</p>
                    </div>

                    {/* Cada lançamento = card, mesmo padrão da despesa lançada */}
                    <div className="space-y-3">
                        {costs.map((c) => (
                            <div key={c.id} className="glass rounded-2xl border border-slate-700 p-4 flex items-center justify-between">
                                <div className="min-w-0">
                                    <p className="text-white font-bold truncate">
                                        {catLabel(c.category)}
                                        {!c.paidFromProject && (
                                            <span className="ml-2 text-[9px] uppercase tracking-wider bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">fora do caixa</span>
                                        )}
                                    </p>
                                    <p className="text-slate-500 text-xs truncate">
                                        {fmtDate(c.date)}{c.description ? ` · ${c.description}` : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    {c.attachments && c.attachments.length > 0 && (
                                        <button onClick={() => openAttachment(c.attachments![0])} className="text-blue-400 hover:text-blue-300 transition" title="Ver comprovante">
                                            <i className="fa-solid fa-paperclip"></i>
                                        </button>
                                    )}
                                    <span className="text-amber-400 font-black">{formatCurrency(c.value)}</span>
                                    <button
                                        onClick={() => { if (window.confirm('Excluir este custo de terreno?')) deleteCost.mutate(c.id); }}
                                        className="text-slate-500 hover:text-rose-400 transition"
                                        title="Excluir"
                                    >
                                        <i className="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {showModal && <AddAcquisitionModal project={project} user={user} onClose={() => setShowModal(false)} />}
        </div>
    );
};

export default AquisicaoSection;
