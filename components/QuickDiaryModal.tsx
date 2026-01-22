import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';

interface QuickDiaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    preSelectedProjectId?: string | null;
    onSave: (projectId: string, diaryEntry: any) => void;
}

const QuickDiaryModal: React.FC<QuickDiaryModalProps> = ({
    isOpen,
    onClose,
    projects,
    preSelectedProjectId,
    onSave
}) => {
    const [projectId, setProjectId] = useState(preSelectedProjectId || '');
    const [content, setContent] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (isOpen) {
            setProjectId(preSelectedProjectId || (projects.length > 0 ? projects[0].id : ''));
            setContent('');
            setDate(new Date().toISOString().split('T')[0]);
            setPhotoUrl(undefined);
        }
    }, [isOpen, preSelectedProjectId, projects]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectId) {
            alert('Selecione uma obra.');
            return;
        }

        // Convert single photo to array for diary structure
        const photos = photoUrl ? [photoUrl] : [];

        onSave(projectId, { content, date, photos, author: 'Voz' }); // Author will be overridden by App.tsx logic usually
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-book-open text-blue-400"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white leading-none">Diário Rápido</h2>
                            <p className="text-xs text-blue-400 font-bold mt-1">Comando de Voz</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 hover:border-red-400 transition"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Project Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-blue-400 uppercase tracking-widest ml-4">
                            Obra
                        </label>
                        <select
                            required
                            value={projectId}
                            onChange={e => setProjectId(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm appearance-none cursor-pointer"
                        >
                            <option value="" disabled>Selecione uma obra...</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                        <DateInput
                            value={date}
                            onChange={setDate}
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                        />
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Relatório do Dia</label>
                        <textarea
                            required
                            autoFocus
                            rows={4}
                            placeholder="O que aconteceu na obra hoje?"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-medium text-white text-sm placeholder-slate-500 resize-none"
                        />
                    </div>

                    <AttachmentUpload
                        label="Foto do Dia (Opcional)"
                        currentUrl={photoUrl}
                        onUpload={setPhotoUrl}
                        onRemove={() => setPhotoUrl(undefined)}
                    />

                    <button
                        type="submit"
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2"
                    >
                        <i className="fa-solid fa-check"></i>
                        Salvar Registro
                    </button>
                </form>
            </div>
        </div>
    );
};

export default QuickDiaryModal;
