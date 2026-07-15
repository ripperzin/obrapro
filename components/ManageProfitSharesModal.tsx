import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Project } from '../types';
import { useSaveProfitShares } from '../hooks/useProfitShares';

interface Row {
    investorId?: string;
    name: string;
    percentage: string;
}

interface Props {
    project: Project;
    onClose: () => void;
}

const inputClass = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none text-sm';

const ManageProfitSharesModal: React.FC<Props> = ({ project, onClose }) => {
    const investors = project.investors || [];
    const [rows, setRows] = useState<Row[]>(
        (project.profitShares || []).map((s) => ({
            investorId: s.investorId,
            name: s.name,
            percentage: String(s.percentage ?? ''),
        }))
    );
    const [saving, setSaving] = useState(false);
    const save = useSaveProfitShares();

    const soma = rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
    const somaOk = Math.abs(soma - 100) < 0.01;

    const addManual = () => setRows([...rows, { name: '', percentage: '' }]);
    const addInvestor = (id: string) => {
        const inv = investors.find((i) => i.id === id);
        if (inv && !rows.some((r) => r.investorId === id)) {
            setRows([...rows, { investorId: inv.id, name: inv.name, percentage: '' }]);
        }
    };
    const update = (idx: number, field: keyof Row, value: string) =>
        setRows(rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    const remove = (idx: number) => setRows(rows.filter((_, i) => i !== idx));

    const handleSave = async () => {
        try {
            setSaving(true);
            await save.mutateAsync({
                projectId: project.id,
                shares: rows.map((r) => ({ investorId: r.investorId, name: r.name, percentage: parseFloat(r.percentage) || 0 })),
            });
            onClose();
        } catch (e: any) {
            alert('Erro ao salvar: ' + (e.message || e));
            setSaving(false);
        }
    };

    const investorsDisponiveis = investors.filter((i) => !rows.some((r) => r.investorId === i.id));
    const modalRoot = document.getElementById('modal-root') || document.body;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="glass w-full max-w-md rounded-2xl border border-slate-700 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-white font-black text-lg flex items-center gap-2">
                        <i className="fa-solid fa-users-gear text-blue-400"></i> Participação nos lucros
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>

                <p className="text-[11px] text-slate-500 mb-4">
                    Quem divide o lucro e quanto. Pode incluir investidores e também quem não aportou (ex: o administrador da obra).
                </p>

                <div className="space-y-2 mb-4">
                    {rows.length === 0 && <p className="text-slate-500 text-sm">Nenhum sócio ainda.</p>}
                    {rows.map((r, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <input
                                value={r.name}
                                onChange={(e) => update(idx, 'name', e.target.value)}
                                placeholder="Nome do sócio"
                                className={`${inputClass} flex-1 min-w-0`}
                            />
                            <div className="relative w-20 shrink-0">
                                <input
                                    type="number" min="0" max="100" inputMode="decimal"
                                    value={r.percentage}
                                    onChange={(e) => update(idx, 'percentage', e.target.value)}
                                    placeholder="0"
                                    className={`${inputClass} w-full text-center pr-6`}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                            </div>
                            <button type="button" onClick={() => remove(idx)} className="text-slate-500 hover:text-rose-400 shrink-0 w-8">
                                <i className="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    ))}
                </div>

                {/* Adicionar */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {investorsDisponiveis.length > 0 && (
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) addInvestor(e.target.value); }}
                            className={`${inputClass} flex-1`}
                        >
                            <option value="">+ Investidor…</option>
                            {investorsDisponiveis.map((i) => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                            ))}
                        </select>
                    )}
                    <button type="button" onClick={addManual} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white text-sm font-bold">
                        <i className="fa-solid fa-plus mr-1"></i> Sócio manual
                    </button>
                </div>

                {/* Soma */}
                <div className={`flex items-center justify-between rounded-xl px-4 py-2 mb-4 ${somaOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    <span className="text-xs font-black uppercase tracking-widest">Soma</span>
                    <span className="font-black">{soma.toFixed(1)}%{!somaOk && ' (precisa fechar 100%)'}</span>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                    {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                    {saving ? 'Salvando…' : 'Salvar'}
                </button>
            </div>
        </div>,
        modalRoot
    );
};

export default ManageProfitSharesModal;
