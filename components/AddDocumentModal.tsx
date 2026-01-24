import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ProjectDocument } from '../types';
import AttachmentUpload from './AttachmentUpload';

interface AddDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (doc: Omit<ProjectDocument, 'id' | 'createdAt'>) => void;
}

const AddDocumentModal: React.FC<AddDocumentModalProps> = ({ isOpen, onClose, onSave }) => {
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState<ProjectDocument['category']>('Projeto');
    const [url, setUrl] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !url) {
            alert('Preencha o título e anexe o arquivo.');
            return;
        }
        onSave({ title, category, url });
        onClose();
        setTitle('');
        setCategory('Projeto');
        setUrl('');
    };

    const categories = ['Projeto', 'Escritura', 'Contrato', 'Outros'];

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-folder-open text-blue-400"></i>
                        </div>
                        <h2 className="text-xl font-black text-white">Novo Documento</h2>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Título</label>
                        <input
                            required
                            autoFocus
                            type="text"
                            placeholder="Ex: Planta Baixa Térreo"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Categoria</label>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value as any)}
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm appearance-none cursor-pointer"
                        >
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Arquivo</label>
                        <div className="h-20 w-full">
                            <AttachmentUpload
                                value={url}
                                onChange={val => setUrl(val || '')}
                                bucketName="project-documents"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 mt-4"
                    >
                        <i className="fa-solid fa-check"></i>
                        Salvar Documento
                    </button>
                </form>
            </div>
        </div>,
        modalRoot
    );
};

export default AddDocumentModal;
