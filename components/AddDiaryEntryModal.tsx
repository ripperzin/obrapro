import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DiaryEntry } from '../types';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';

interface AddDiaryEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (entry: Omit<DiaryEntry, 'id' | 'createdAt'>) => void;
    currentUserName: string;
}

const AddDiaryEntryModal: React.FC<AddDiaryEntryModalProps> = ({ isOpen, onClose, onAdd, currentUserName }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [content, setContent] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);

    // Auxiliary state for upload
    const [currentPhoto, setCurrentPhoto] = useState<string | undefined>(undefined);

    const DRAFT_KEY = 'draft_new_diary';

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    if (data.date) setDate(data.date);
                    if (data.content) setContent(data.content);
                    if (data.photos) setPhotos(data.photos);
                } catch (e) { console.error(e); }
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ date, content, photos }));
        }
    }, [date, content, photos, isOpen]);

    const handleClose = () => {
        localStorage.removeItem(DRAFT_KEY);
        onClose();
    };

    if (!isOpen) return null;

    const handleAddPhoto = (url: string | undefined) => {
        if (url) {
            setPhotos(prev => [...prev, url]);
            setCurrentPhoto(undefined); // Reset upload field
        }
    };

    const handleRemovePhoto = (index: number) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!content) {
            alert('Escreva o conteúdo do diário.');
            return;
        }
        onAdd({
            date,
            content,
            photos,
            author: currentUserName
        });
        localStorage.removeItem(DRAFT_KEY);
        onClose();
        // Reset form
        setDate(new Date().toISOString().split('T')[0]);
        setContent('');
        setPhotos([]);
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-book-open text-blue-400"></i>
                        </div>
                        <h2 className="text-xl font-black text-white">Novo Registro</h2>
                    </div>
                    <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Data</label>
                        <DateInput
                            value={date}
                            onChange={setDate}
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                            placeholder="DD/MM/AAAA"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Ocorrências / Atividades</label>
                        <textarea
                            required
                            autoFocus
                            rows={6}
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-medium text-white text-sm placeholder-slate-500 resize-none"
                            placeholder="Descreva o que foi feito hoje na obra..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Fotos</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {photos.map((photo, index) => (
                                <div key={index} className="relative w-16 h-16 rounded-xl overflow-hidden group border border-slate-600">
                                    <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                                        <img src={photo} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemovePhoto(index)}
                                        className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl-lg hover:bg-red-600"
                                    >
                                        <i className="fa-solid fa-xmark text-xs"></i>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="h-16 w-full">
                            <AttachmentUpload
                                className="w-full h-full"
                                value={currentPhoto}
                                onChange={handleAddPhoto}
                                bucketName="project-documents"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 mt-4"
                    >
                        <i className="fa-solid fa-check"></i>
                        Salvar no Diário
                    </button>
                </form>
            </div>
        </div>,
        modalRoot
    );
};

export default AddDiaryEntryModal;
