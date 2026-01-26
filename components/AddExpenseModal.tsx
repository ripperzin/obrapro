import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ProjectMacro, ProjectSubMacro } from '../types';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import { ReceiptScanner } from './ReceiptScanner';
import { ReceiptData } from '../lib/gemini';
import { getSignedUrl, uploadFile } from '../utils/storage';

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (expense: any) => void;
    macros: ProjectMacro[];
    subMacros: ProjectSubMacro[];
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ isOpen, onClose, onSave, macros, subMacros }) => {
    const [formData, setFormData] = useState({
        description: '',
        value: 0,
        date: new Date().toISOString().split('T')[0],
        attachmentUrl: undefined as string | undefined,
        attachments: [] as string[],
        macroId: '' as string,
        subMacroId: '' as string
    });
    const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            setFormData({
                description: '',
                value: 0,
                date: new Date().toISOString().split('T')[0],
                attachmentUrl: undefined,
                attachments: [] as string[],
                macroId: '',
                subMacroId: ''
            });
            setResolvedUrls({});
        }
    }, [isOpen]);

    // Resolve URLs
    useEffect(() => {
        const resolveParams = async () => {
            const newResolved: Record<string, string> = {};
            if (formData.attachments) {
                for (const path of formData.attachments) {
                    if (path.startsWith('http')) {
                        newResolved[path] = path;
                    } else {
                        const url = await getSignedUrl(path);
                        if (url) newResolved[path] = url;
                    }
                }
            }
            setResolvedUrls(newResolved);
        };
        resolveParams();
    }, [formData.attachments]);

    const handleScanComplete = async (data: ReceiptData, file: File) => {
        // Upload file automatically
        let attachmentPath = undefined;
        if (file) {
            const path = await uploadFile(file);
            if (path) {
                attachmentPath = path;
            }
        }

        // Prepare description
        let desc = data.description || '';
        if (data.merchant) {
            desc = desc ? `${data.merchant} - ${desc}` : data.merchant;
        }

        setFormData(prev => ({
            ...prev,
            date: data.date || prev.date,
            value: data.amount || prev.value,
            description: desc || prev.description,
            // Add new attachment specific to this scan
            attachments: attachmentPath ? [...(prev.attachments || []), attachmentPath] : prev.attachments
        }));
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        let finalMacroId = formData.macroId;
        // Auto-select 'Geral/Outros' if no category
        if (!finalMacroId && macros.length > 0) {
            const defaultMacro = macros.find(m => m.name === 'Geral/Outros' || m.name === 'Outros');
            if (defaultMacro) finalMacroId = defaultMacro.id;
        }

        onSave({
            ...formData,
            attachmentUrl: formData.attachments.length > 0 ? formData.attachments[0] : undefined,
            macroId: finalMacroId || undefined,
            subMacroId: formData.subMacroId || undefined
        });
        onClose();
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-wallet text-green-400"></i>
                        </div>
                        <h2 className="text-xl font-black text-white">Nova Despesa</h2>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    <div className="mb-4">
                        <ReceiptScanner onScanComplete={handleScanComplete} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Descrição</label>
                        <input
                            required
                            autoFocus
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                            placeholder="Ex: Cimento, Pintor..."
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Valor (R$)</label>
                            <MoneyInput
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm"
                                value={formData.value}
                                onBlur={(val) => setFormData({ ...formData, value: val })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Data</label>
                            <DateInput
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                                value={formData.date}
                                onChange={(val) => setFormData({ ...formData, date: val })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Categoria</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none font-bold text-white text-xs appearance-none cursor-pointer"
                                value={formData.macroId}
                                onChange={e => setFormData({ ...formData, macroId: e.target.value, subMacroId: '' })}
                            >
                                <option value="">Sem categoria</option>
                                {macros.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Detalhe</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none font-bold text-white text-xs appearance-none cursor-pointer disabled:opacity-50"
                                value={formData.subMacroId}
                                onChange={e => setFormData({ ...formData, subMacroId: e.target.value })}
                                disabled={!formData.macroId}
                            >
                                <option value="">Sem detalhe</option>
                                {subMacros
                                    .filter(sm => sm.projectMacroId === formData.macroId)
                                    .map(sm => (
                                        <option key={sm.id} value={sm.id}>{sm.name}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Anexos ({formData.attachments?.length || 0})</label>

                        {/* Grid de Anexos */}
                        {formData.attachments && formData.attachments.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 mb-2">
                                {formData.attachments.map((path, index) => {
                                    const url = resolvedUrls[path] || path;
                                    return (
                                        <div key={index} className="relative aspect-square bg-slate-700 rounded-xl overflow-hidden border border-slate-600 group">
                                            {/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(path) ? (
                                                <div className="w-full h-full relative">
                                                    <img
                                                        src={url}
                                                        className="w-full h-full object-cover"
                                                        alt="anexo"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                                                    <i className="fa-solid fa-file-pdf text-xl"></i>
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (window.confirm('Tem certeza que deseja excluir este anexo?')) {
                                                        const newAttachments = formData.attachments!.filter((_, i) => i !== index);
                                                        setFormData({ ...formData, attachments: newAttachments });
                                                    }
                                                }}
                                                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-10"
                                            >
                                                <i className="fa-solid fa-xmark text-xs"></i>
                                            </button>

                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 truncate text-[8px] text-white text-center">
                                                Anexo {index + 1}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="h-16">
                            <AttachmentUpload
                                value={undefined}
                                onChange={(url) => {
                                    if (url) {
                                        setFormData(prev => ({
                                            ...prev,
                                            attachments: [...(prev.attachments || []), url]
                                        }));
                                    }
                                }}
                                minimal={false}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition shadow-lg shadow-green-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 mt-4"
                    >
                        <i className="fa-solid fa-check"></i> Salvar Despesa
                    </button>
                </form>
            </div>
        </div>,
        modalRoot
    );
};

export default AddExpenseModal;
