import React, { useState } from 'react';
import { DiaryEntry } from '../types';
import AttachmentUpload from './AttachmentUpload';
import DateInput from './DateInput';
import { openAttachment } from '../utils/storage';
import AddDiaryEntryModal from './AddDiaryEntryModal';

interface DiarySectionProps {
    diary: DiaryEntry[];
    onAdd: (entry: Omit<DiaryEntry, 'id' | 'createdAt'>) => void;
    onUpdate?: (entry: DiaryEntry) => void;
    onDelete?: (id: string) => void;
    isAdmin?: boolean;
    currentUserName: string;
}

const DiarySection: React.FC<DiarySectionProps> = ({
    diary,
    onAdd,
    onUpdate,
    onDelete,
    isAdmin = false,
    currentUserName
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editEntry, setEditEntry] = useState<DiaryEntry | null>(null);

    // --- Update Handlers ---

    const startEditing = (entry: DiaryEntry) => {
        setEditingId(entry.id);
        setEditEntry({ ...entry });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditEntry(null);
    };

    const handleUpdatePhoto = (url: string | undefined) => {
        if (url && editEntry) {
            setEditEntry({ ...editEntry, photos: [...(editEntry.photos || []), url] });
        }
    };

    const handleRemoveUpdatePhoto = (index: number) => {
        if (editEntry) {
            setEditEntry({
                ...editEntry,
                photos: (editEntry.photos || []).filter((_, i) => i !== index)
            });
        }
    };

    const saveUpdate = () => {
        if (editEntry && onUpdate) {
            onUpdate(editEntry);
            cancelEditing();
        }
    };

    // Ordenar: Mais novas primeiro (Decrescente)
    const sortedEntries = [...diary].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return (
        <div className="space-y-8 pb-20 animate-fade-in text-white">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-black uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-book-open text-blue-500"></i>
                    Diário de Obra
                </h2>
                {!isAdding && !editingId && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all"
                    >
                        <i className="fa-solid fa-pen"></i> Novo Registro
                    </button>
                )}
            </div>


            <AddDiaryEntryModal
                isOpen={isAdding}
                onClose={() => setIsAdding(false)}
                onAdd={onAdd}
                currentUserName={currentUserName}
            />

            {/* Timeline */}
            <div className="relative border-l-2 border-slate-700 ml-3 md:ml-6 space-y-8 pl-6 md:pl-8">
                {sortedEntries.map((entry, index) => {
                    const isEditing = editingId === entry.id;
                    const normalizedAuthor = (entry.author || '').toLowerCase().trim();
                    const normalizedUser = (currentUserName || '').toLowerCase().trim();
                    // Simplificando: Se as funções existirem, mostra os botões.
                    // O controle de quem pode editar fica por conta do bom senso ou backend se necessário futuramente.
                    // const canEdit = isAdmin || normalizedAuthor === normalizedUser || normalizedAuthor === 'voz' || normalizedAuthor === 'usuário';

                    if (isEditing && editEntry) {
                        return (
                            <div key={entry.id} className="bg-slate-800/50 border border-yellow-500/30 p-6 rounded-2xl space-y-4 animate-fade-in relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
                                <h3 className="text-sm font-bold text-yellow-500 uppercase mb-4">Editando Registro</h3>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Data</label>
                                    <DateInput
                                        value={editEntry.date}
                                        onChange={(val) => setEditEntry({ ...editEntry, date: val })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-yellow-500 outline-none font-bold"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Conteúdo</label>
                                    <textarea
                                        rows={4}
                                        value={editEntry.content}
                                        onChange={e => setEditEntry({ ...editEntry, content: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-yellow-500 outline-none font-medium resize-none"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase">Fotos</label>
                                    <div className="flex flex-wrap gap-3 mb-3">
                                        {(editEntry.photos || []).map((photo, i) => (
                                            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-600">
                                                <button
                                                    onClick={() => handleRemoveUpdatePhoto(i)}
                                                    className="absolute top-0 right-0 bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-bl-lg hover:bg-red-600 z-10"
                                                >
                                                    <i className="fa-solid fa-xmark text-xs"></i>
                                                </button>
                                                <img src={photo} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="h-14 w-full">
                                        <AttachmentUpload
                                            value={undefined}
                                            onChange={handleUpdatePhoto}
                                            bucketName="project-documents"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button onClick={saveUpdate} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider shadow-lg shadow-yellow-600/20">
                                        Salvar Alterações
                                    </button>
                                    <button onClick={cancelEditing} className="px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={entry.id || index} className="relative group">
                            {/* Dot */}
                            <div className="absolute -left-[35px] md:-left-[41px] top-0 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 group-hover:scale-125 transition-transform flex items-center justify-center z-10">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                            </div>

                            <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all relative">
                                {/* Actions (Edit/Delete) - Always visible if callbacks exist */}
                                {onDelete && onUpdate && (
                                    <div className="absolute top-4 right-4 flex gap-2 z-10">
                                        <button
                                            onClick={() => startEditing(entry)}
                                            className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-blue-600 text-blue-400 hover:text-white flex items-center justify-center transition-all"
                                            title="Editar"
                                        >
                                            <i className="fa-solid fa-pen text-xs"></i>
                                        </button>
                                        <button
                                            onClick={() => onDelete(entry.id)}
                                            className="w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-red-600 text-red-400 hover:text-white flex items-center justify-center transition-all"
                                            title="Excluir"
                                        >
                                            <i className="fa-solid fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                )}

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
                                                className="w-16 h-16 bg-slate-700 rounded-lg flex items-center justify-center hover:opacity-80 transition relative overflow-hidden group/img"
                                            >
                                                <img src={photo} alt="" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                    <i className="fa-solid fa-eye text-white text-xs"></i>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

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
