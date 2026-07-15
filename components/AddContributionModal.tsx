import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Project, User } from '../types';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import { useAddInvestor, useAddContribution } from '../hooks/useAportes';

interface Props {
    project: Project;
    user: User;
    onClose: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const inputClass =
    'w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block';

const AddContributionModal: React.FC<Props> = ({ project, user, onClose }) => {
    const investors = project.investors || [];

    const [investorId, setInvestorId] = useState<string>(investors[0]?.id || '__new__');
    const [newInvestorName, setNewInvestorName] = useState('');
    const [value, setValue] = useState(0);
    const [date, setDate] = useState(todayIso());
    const [description, setDescription] = useState('');
    const [attachment, setAttachment] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addInvestor = useAddInvestor();
    const addContribution = useAddContribution();

    const isNew = investors.length === 0 || investorId === '__new__';

    const handleSave = async () => {
        setError(null);
        if (value <= 0) {
            setError('Informe um valor maior que zero.');
            return;
        }
        if (isNew && !newInvestorName.trim()) {
            setError('Digite o nome do investidor.');
            return;
        }
        setSaving(true);
        try {
            let finalInvestorId = investorId;
            if (isNew) {
                const inv = await addInvestor.mutateAsync({
                    projectId: project.id,
                    name: newInvestorName.trim(),
                });
                finalInvestorId = inv.id;
            }
            await addContribution.mutateAsync({
                projectId: project.id,
                investorId: finalInvestorId,
                value,
                date,
                description: description.trim() || undefined,
                userId: user.id,
                userName: user.login,
                attachments: attachment ? [attachment] : [],
            });
            onClose();
        } catch (e: any) {
            console.error('[AddContribution] erro:', e);
            setError(e.message || 'Erro ao salvar aporte.');
            setSaving(false);
        }
    };

    const modalRoot = document.getElementById('modal-root') || document.body;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                className="glass w-full max-w-md rounded-2xl border border-slate-700 p-6 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-white font-black text-lg flex items-center gap-2">
                        <i className="fa-solid fa-hand-holding-dollar text-emerald-400"></i> Registrar aporte
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Investidor */}
                    <div>
                        <label className={labelClass}>Investidor</label>
                        {investors.length > 0 && (
                            <select
                                value={investorId}
                                onChange={(e) => setInvestorId(e.target.value)}
                                className={inputClass}
                            >
                                {investors.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.name}
                                    </option>
                                ))}
                                <option value="__new__">➕ Novo investidor…</option>
                            </select>
                        )}
                        {isNew && (
                            <input
                                value={newInvestorName}
                                onChange={(e) => setNewInvestorName(e.target.value)}
                                placeholder="Nome do investidor"
                                className={`${inputClass} ${investors.length > 0 ? 'mt-2' : ''}`}
                            />
                        )}
                    </div>

                    {/* Valor */}
                    <div>
                        <label className={labelClass}>Valor do aporte</label>
                        <MoneyInput value={value} onChange={setValue} className={inputClass} />
                    </div>

                    {/* Data */}
                    <div>
                        <label className={labelClass}>Data</label>
                        <DateInput value={date} onChange={setDate} className={inputClass} />
                    </div>

                    {/* Observação */}
                    <div>
                        <label className={labelClass}>Observação (opcional)</label>
                        <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ex: aporte para a laje"
                            className={inputClass}
                        />
                    </div>

                    {/* Comprovante */}
                    <div>
                        <label className={labelClass}>Comprovante (opcional)</label>
                        <AttachmentUpload value={attachment} onChange={setAttachment} bucketName="expense-attachments" />
                    </div>

                    {error && (
                        <p className="text-rose-400 text-xs font-bold">
                            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                            {error}
                        </p>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition flex items-center justify-center gap-2"
                    >
                        {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                        {saving ? 'Salvando…' : 'Salvar aporte'}
                    </button>
                </div>
            </div>
        </div>,
        modalRoot
    );
};

export default AddContributionModal;
