import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Project, User, ACQUISITION_CATEGORY_LABELS, AcquisitionCategory } from '../types';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import { useAddAcquisitionCost } from '../hooks/useAquisicao';

interface Props {
    project: Project;
    user: User;
    onClose: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const inputClass =
    'w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block';

const AddAcquisitionModal: React.FC<Props> = ({ project, user, onClose }) => {
    const [category, setCategory] = useState<AcquisitionCategory>('terreno');
    const [value, setValue] = useState(0);
    const [date, setDate] = useState(todayIso());
    const [description, setDescription] = useState('');
    const [paidFromProject, setPaidFromProject] = useState(true);
    const [attachment, setAttachment] = useState<string | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addAcquisition = useAddAcquisitionCost();

    const handleSave = async () => {
        setError(null);
        if (value <= 0) {
            setError('Informe um valor maior que zero.');
            return;
        }
        try {
            setSaving(true);
            await addAcquisition.mutateAsync({
                projectId: project.id,
                category,
                description: description.trim() || undefined,
                value,
                date,
                paidFromProject,
                attachments: attachment ? [attachment] : [],
                userId: user.id,
                userName: user.login,
            });
            onClose();
        } catch (e: any) {
            console.error('[AddAcquisition] erro:', e);
            setError(e.message || 'Erro ao salvar.');
            setSaving(false);
        }
    };

    const modalRoot = document.getElementById('modal-root') || document.body;
    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div className="glass w-full max-w-md rounded-2xl border border-slate-700 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-white font-black text-lg flex items-center gap-2">
                        <i className="fa-solid fa-map-location-dot text-amber-400"></i> Custo de aquisição
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Tipo</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value as AcquisitionCategory)} className={inputClass}>
                            {Object.entries(ACQUISITION_CATEGORY_LABELS).map(([k, label]) => (
                                <option key={k} value={k}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass}>Valor</label>
                        <MoneyInput value={value} onChange={setValue} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Data</label>
                        <DateInput value={date} onChange={setDate} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Observação (opcional)</label>
                        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: lote 12, quadra B" className={inputClass} />
                    </div>

                    {/* Toggle pago pela obra */}
                    <button
                        type="button"
                        onClick={() => setPaidFromProject(!paidFromProject)}
                        className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-left"
                    >
                        <div>
                            <p className="text-white font-bold text-sm">Pago pela obra?</p>
                            <p className="text-slate-500 text-[11px]">{paidFromProject ? 'Saiu do caixa (dos aportes)' : 'Já era seu / entrada de sócio'}</p>
                        </div>
                        <span className={`w-12 h-7 rounded-full flex items-center transition-all ${paidFromProject ? 'bg-amber-500 justify-end' : 'bg-slate-600 justify-start'} p-1`}>
                            <span className="w-5 h-5 bg-white rounded-full block"></span>
                        </span>
                    </button>

                    <div>
                        <label className={labelClass}>Comprovante (opcional)</label>
                        <AttachmentUpload value={attachment} onChange={setAttachment} bucketName="expense-attachments" />
                    </div>

                    {error && (
                        <p className="text-rose-400 text-xs font-bold">
                            <i className="fa-solid fa-triangle-exclamation mr-1"></i>{error}
                        </p>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition flex items-center justify-center gap-2"
                    >
                        {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>,
        modalRoot
    );
};

export default AddAcquisitionModal;
