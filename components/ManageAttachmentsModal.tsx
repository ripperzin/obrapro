import React, { useState, useEffect } from 'react';
import AttachmentUpload from './AttachmentUpload';
import { getSignedUrl } from '../utils/storage';

interface ManageAttachmentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    attachments: string[]; // Recebe a lista flat
    onSave: (newAttachments: string[]) => void;
}

const ManageAttachmentsModal: React.FC<ManageAttachmentsModalProps> = ({ isOpen, onClose, attachments: initialAttachments, onSave }) => {
    const [attachments, setAttachments] = useState<string[]>(initialAttachments || []);
    const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen) {
            setAttachments(initialAttachments || []);
        }
    }, [isOpen, initialAttachments]);

    // Resolve URLs
    useEffect(() => {
        const resolveParams = async () => {
            const newResolved: Record<string, string> = {};
            for (const path of attachments) {
                if (path.startsWith('http')) {
                    newResolved[path] = path;
                } else {
                    const url = await getSignedUrl(path);
                    if (url) newResolved[path] = url;
                }
            }
            setResolvedUrls(newResolved);
        };
        resolveParams();
    }, [attachments]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(attachments);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/95">
                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                        <i className="fa-solid fa-paperclip text-blue-400"></i>
                        Gerenciar Anexos
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-slate-800 rounded-full text-slate-400 hover:text-white transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-3 gap-2">
                        {attachments.map((path, index) => {
                            const url = resolvedUrls[path] || path;
                            return (
                                <div key={index} className="relative aspect-square bg-slate-800 rounded-xl overflow-hidden border border-slate-600 group">
                                    {/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(path) ? (
                                        <img
                                            src={url}
                                            className="w-full h-full object-cover"
                                            alt="anexo"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-700 text-slate-400">
                                            <i className="fa-solid fa-file-pdf text-2xl"></i>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-md flex items-center justify-center shadow hover:bg-red-600 transition"
                                    >
                                        <i className="fa-solid fa-trash text-xs"></i>
                                    </button>

                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-[9px] py-1 px-2 rounded text-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        Ver
                                    </a>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-slate-700 pt-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Adicionar Novo</label>
                        <AttachmentUpload
                            value={undefined}
                            onChange={(url) => {
                                if (url) setAttachments(prev => [...prev, url]);
                            }}
                        />
                    </div>
                </div>

                <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-blue-700 transition shadow-lg shadow-blue-600/20"
                    >
                        Salvar Alterações
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageAttachmentsModal;
