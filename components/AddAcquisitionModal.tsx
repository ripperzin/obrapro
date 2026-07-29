import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Project, User, AcquisitionCost, ACQUISITION_CATEGORY_LABELS, AcquisitionCategory } from '../types';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import { ReceiptScanner } from './ReceiptScanner';
import { ReceiptData } from '../lib/gemini';
import { uploadFile } from '../utils/storage';
import { useAddAcquisitionCost, useUpdateAcquisitionCost } from '../hooks/useAquisicao';

interface Props {
    project: Project;
    user: User;
    editing?: AcquisitionCost;   // quando presente: modo edição (mesma tela, salva por cima)
    onClose: () => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const inputClass =
    'w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none';
const labelClass = 'text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block';

// Deriva o "quem pagou" a partir de um custo já salvo (mesma fonte única do modal).
const payerFromCost = (c?: AcquisitionCost): string => {
    if (!c) return 'caixa';
    if (c.paidByInvestorId) return c.paidByInvestorId;
    return c.paidFromProject ? 'caixa' : '__fora__';
};

const AddAcquisitionModal: React.FC<Props> = ({ project, user, editing, onClose }) => {
    const investors = project.investors || [];
    const isEditing = !!editing;

    const [category, setCategory] = useState<AcquisitionCategory>((editing?.category as AcquisitionCategory) || 'terreno');
    const [value, setValue] = useState(editing?.value || 0);
    const [date, setDate] = useState(editing?.date || todayIso());
    const [description, setDescription] = useState(editing?.description || '');
    // Fonte única de "quem pagou": 'caixa' | '__fora__' | <id do sócio>
    //   caixa     → saiu do caixa (dos aportes)
    //   __fora__  → fora do caixa, sem sócio ("já era meu")
    //   <id>      → sócio pagou do próprio bolso → conta como aporte dele
    const [payer, setPayer] = useState<string>(payerFromCost(editing));
    // PERMUTA: terreno pago com casas (não é dinheiro). Anula o "pago por" (não mexe no caixa).
    const [paidWithUnits, setPaidWithUnits] = useState(editing?.paidWithUnits || false);
    const [attachment, setAttachment] = useState<string | undefined>(editing?.attachments?.[0]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const paidFromProject = !paidWithUnits && payer === 'caixa';
    const paidByInvestorId = !paidWithUnits && payer !== 'caixa' && payer !== '__fora__' ? payer : undefined;

    const addAcquisition = useAddAcquisitionCost();
    const updateAcquisition = useUpdateAcquisitionCost();

    // OCR: escaneia o comprovante (cartório, comissão, boleto do terreno) e preenche
    // valor/data/observação — mesmo mecanismo da despesa.
    const handleScanComplete = async (data: ReceiptData, file: File) => {
        let path: string | undefined;
        if (file) {
            const uploaded = await uploadFile(file);
            if (uploaded) path = uploaded;
        }
        let desc = data.description || '';
        if (data.merchant) desc = desc ? `${data.merchant} - ${desc}` : data.merchant;
        if (data.date) setDate(data.date);
        if (data.amount) setValue(data.amount);
        if (desc) setDescription(desc);
        if (path) setAttachment(path);
    };

    const handleSave = async () => {
        setError(null);
        if (value <= 0) {
            setError('Informe um valor maior que zero.');
            return;
        }
        try {
            setSaving(true);
            const payload = {
                projectId: project.id,
                category,
                description: description.trim() || undefined,
                value,
                date,
                paidFromProject,
                paidByInvestorId,
                paidWithUnits,
                attachments: attachment ? [attachment] : [],
                userId: user.id,
                userName: user.login,
            };
            if (isEditing && editing) {
                await updateAcquisition.mutateAsync({ ...payload, id: editing.id });
            } else {
                await addAcquisition.mutateAsync(payload);
            }
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
                        <i className="fa-solid fa-map-location-dot text-amber-400"></i> {isEditing ? 'Editar custo de aquisição' : 'Custo de aquisição'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>

                <div className="space-y-4">
                    <ReceiptScanner onScanComplete={handleScanComplete} />

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

                    {/* PERMUTA: terreno pago com casas. Anula a conta em dinheiro. */}
                    <button
                        type="button"
                        onClick={() => setPaidWithUnits(!paidWithUnits)}
                        className={`w-full flex items-center justify-between rounded-xl px-4 py-3 text-left border ${paidWithUnits ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800 border-slate-700'}`}
                    >
                        <div className="min-w-0">
                            <p className="text-white font-bold text-sm"><i className="fa-solid fa-handshake mr-1 text-amber-400"></i> Pago com casas (permuta)?</p>
                            <p className="text-slate-500 text-[11px] leading-snug">{paidWithUnits ? 'Não é custo em dinheiro — marque as casas dadas como "Permuta" nas Unidades.' : 'O terreno foi trocado por casas do empreendimento.'}</p>
                        </div>
                        <span className={`w-12 h-7 rounded-full flex items-center transition-all shrink-0 ${paidWithUnits ? 'bg-amber-500 justify-end' : 'bg-slate-600 justify-start'} p-1`}>
                            <span className="w-5 h-5 bg-white rounded-full block"></span>
                        </span>
                    </button>

                    {/* Quem pagou (só quando NÃO é permuta). Com sócios vira um seletor (igual ao da
                        despesa): se um sócio pagou do bolso, o valor conta como aporte dele. */}
                    {paidWithUnits ? null : investors.length > 0 ? (
                        <div>
                            <label className={labelClass}>Pago por</label>
                            <select value={payer} onChange={(e) => setPayer(e.target.value)} className={inputClass}>
                                <option value="caixa">Caixa da obra (saiu dos aportes)</option>
                                {investors.map((inv) => (
                                    <option key={inv.id} value={inv.id}>{inv.name} (do próprio bolso)</option>
                                ))}
                                <option value="__fora__">Já era meu / fora do caixa</option>
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1">
                                {payer === 'caixa'
                                    ? 'Sai do caixa da obra.'
                                    : payer === '__fora__'
                                        ? 'Não mexe no caixa — não conta como aporte de ninguém.'
                                        : 'Não sai do caixa — conta como aporte deste sócio.'}
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setPayer(paidFromProject ? '__fora__' : 'caixa')}
                            className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-left"
                        >
                            <div>
                                <p className="text-white font-bold text-sm">Pago pela obra?</p>
                                <p className="text-slate-500 text-[11px]">{paidFromProject ? 'Saiu do caixa (dos aportes)' : 'Já era seu / fora do caixa'}</p>
                            </div>
                            <span className={`w-12 h-7 rounded-full flex items-center transition-all ${paidFromProject ? 'bg-amber-500 justify-end' : 'bg-slate-600 justify-start'} p-1`}>
                                <span className="w-5 h-5 bg-white rounded-full block"></span>
                            </span>
                        </button>
                    )}

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
                        {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>,
        modalRoot
    );
};

export default AddAcquisitionModal;
