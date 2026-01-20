import React, { useState } from 'react';
import { DiaryEntry } from '../types';
import AttachmentUpload from './AttachmentUpload';
import DateInput from './DateInput';
import { openAttachment } from '../utils/storage';

interface DiarySectionProps {
    diary: DiaryEntry[];
    onAdd: (entry: Omit<DiaryEntry, 'id' | 'createdAt'>) => void;
    isAdmin?: boolean;
    currentUserName: string;
}

const DiarySection: React.FC<DiarySectionProps> = ({
    diary,
    onAdd,
    isAdmin = false,
    currentUserName
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newEntry, setNewEntry] = useState({
        date: new Date().toISOString().split('T')[0],
        content: '',
        photos: [] as string[]
    });

    const handleAddPhoto = (url: string | undefined) => {
        if (url) {
            setNewEntry(prev => ({ ...prev, photos: [...prev.photos, url] }));
        }
    };

    const handleRemovePhoto = (index: number) => {
        setNewEntry(prev => ({
            ...prev,
            photos: prev.photos.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = () => {
        if (!newEntry.content) {
            alert('Escreva o conteúdo do diário.');
            return;
        }
        onAdd({
            date: newEntry.date,
            content: newEntry.content,
            photos: newEntry.photos,
            author: currentUserName
        });
        setIsAdding(false);
        setNewEntry({
            date: new Date().toISOString().split('T')[0],
            content: '',
            photos: []
        });
    };

    // Ordenar por data (mais recente primeiro)
    const sortedEntries = [...diary].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="space-y-8 pb-20 animate-fade-in text-white">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-black uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-book-open text-blue-500"></i>
                    Diário de Obra
                </h2>
                {isAdmin && !isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all"
                    >
                        <i className="fa-solid fa-pen"></i> Novo Registro
                    </button>
                )}
            </div>

            {/* Form */}
            {isAdding && (
                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-4 animate-fade-in relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <h3 className="text-sm font-bold uppercase mb-4">Adicionar Registro</h3>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase">Data</label>
                        <DateInput
                            value={newEntry.date}
                            onChange={(val) => setNewEntry({ ...newEntry, date: val })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none font-bold"
                            placeholder="DD/MM/AAAA"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase">Ocorrências / Atividades</label>
                        <textarea
                            rows={4}
                            value={newEntry.content}
                            onChange={e => setNewEntry({ ...newEntry, content: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors font-medium resize-none"
                            placeholder="Descreva o que foi feito hoje na obra..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase">Fotos</label>
                        <div className="flex flex-wrap gap-3 mb-3">
                            {newEntry.photos.map((photo, index) => (
                                <div key={index} className="relative w-20 h-20 rounded-xl overflow-hidden group border border-slate-600">
                                    <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                                        <i className="fa-solid fa-image text-slate-400"></i>
                                    </div>
                                    <button
                                        onClick={() => handleRemovePhoto(index)}
                                        className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl-lg hover:bg-red-600"
                                    >
                                        <i className="fa-solid fa-xmark text-xs"></i>
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Upload Button */}
                        <div className="h-14 w-full">
                            <AttachmentUpload
                                className="w-full h-full"
                                value={undefined}
                                onChange={handleAddPhoto}
                                bucketName="project-documents"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button onClick={handleSubmit} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider shadow-lg shadow-green-600/20">
                            Salvar no Diário
                        </button>
                        <button onClick={() => setIsAdding(false)} className="px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold">
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Timeline */}
            <div className="relative border-l-2 border-slate-700 ml-3 md:ml-6 space-y-8 pl-6 md:pl-8">
                {sortedEntries.map((entry, index) => (
                    <div key={entry.id || index} className="relative group">
                        {/* Dot */}
                        <div className="absolute -left-[35px] md:-left-[41px] top-0 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 group-hover:scale-125 transition-transform flex items-center justify-center z-10">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                        </div>

                        <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h4 className="font-black text-white text-base">
                                        {new Date(entry.date).toLocaleDateString()}
                                    </h4>
                                    <p className="text-xs text-slate-400 font-bold uppercase mt-0.5">Autor: {entry.author}</p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                                {entry.content}
                            </p>

                            {/* Photos Grid */}
                            {entry.photos && entry.photos.length > 0 && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {entry.photos.map((photo, i) => (
                                        <button
                                            key={i}
                                            onClick={() => openAttachment(photo, 'project-documents')}
                                            className="w-16 h-16 bg-slate-700 rounded-lg flex items-center justify-center hover:opacity-80 transition relative overflow-hidden"
                                        >
                                            <i className="fa-solid fa-image text-slate-400 mb-1"></i>
                                            <span className="text-[9px] text-slate-500 absolute bottom-1 font-bold">Foto {i + 1}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {diary.length === 0 && !isAdding && (
                    <div className="text-center py-10 opacity-50">
                        <p className="text-slate-400 font-bold">Nenhum registro no diário ainda.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DiarySection;
