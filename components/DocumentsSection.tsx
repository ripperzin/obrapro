import React, { useState, useEffect } from 'react';
import { ProjectDocument } from '../types';
import { openAttachment } from '../utils/storage';
import AddDocumentModal from './AddDocumentModal';

interface DocumentsSectionProps {
    documents: ProjectDocument[];
    onAdd: (doc: Omit<ProjectDocument, 'id' | 'createdAt'>) => void;
    onDelete: (id: string) => void;
    isAdmin?: boolean;
}

const DocumentsSection: React.FC<DocumentsSectionProps> = ({
    documents,
    onAdd,
    onDelete,
    isAdmin = false
}) => {
    // Sync with URL action
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') === 'new-document' && !isAdding) {
            setIsAdding(true);
        }
    }, []);

    const handleSetIsAdding = (value: boolean) => {
        const params = new URLSearchParams(window.location.search);
        if (value) {
            params.set('action', 'new-document');
        } else {
            params.delete('action');
        }
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
        setIsAdding(value);
    };

    const categories = ['Projeto', 'Escritura', 'Contrato', 'Outros'];

    // Ordenar documentos: mais recentes primeiro
    const sortedDocs = [...documents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header com Botão Adicionar */}
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                    <i className="fa-solid fa-folder-open mr-2 text-blue-500"></i>
                    Documentos
                </h2>
                {isAdmin && (
                    <button
                        onClick={() => handleSetIsAdding(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                    >
                        <i className="fa-solid fa-plus"></i> Novo Documento
                    </button>
                )}
            </div>

            <AddDocumentModal
                isOpen={isAdding}
                onClose={() => handleSetIsAdding(false)}
                onSave={onAdd}
            />

            {/* Lista de Documentos por Categoria */}
            <div className="space-y-8">
                {categories.map(category => {
                    const categoryDocs = sortedDocs.filter(d => d.category === category);
                    if (categoryDocs.length === 0) return null;

                    return (
                        <div key={category} className="space-y-3">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2 border-l-2 border-slate-700">
                                {category}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {categoryDocs.map(doc => (
                                    <div
                                        key={doc.id}
                                        className="bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 rounded-2xl p-4 flex items-center gap-4 group transition-all hover:bg-slate-800"
                                    >
                                        {/* Ícone */}
                                        <div
                                            onClick={() => openAttachment(doc.url, 'project-documents')}
                                            className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center text-2xl cursor-pointer group-hover:scale-110 transition-transform shrink-0"
                                        >
                                            {category === 'Projeto' ? (
                                                <i className="fa-regular fa-map text-blue-400"></i>
                                            ) : category === 'Contrato' || category === 'Escritura' ? (
                                                <i className="fa-solid fa-file-signature text-purple-400"></i>
                                            ) : (
                                                <i className="fa-regular fa-file text-slate-400"></i>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openAttachment(doc.url, 'project-documents')}>
                                            <h4 className="text-white font-bold text-sm truncate group-hover:text-blue-400 transition-colors">
                                                {doc.title}
                                            </h4>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {new Date(doc.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        {isAdmin && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Excluir este documento?')) onDelete(doc.id);
                                                }}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-red-500/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <i className="fa-solid fa-trash text-xs"></i>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {documents.length === 0 && !isAdding && (
                    <div className="text-center py-12 opacity-50">
                        <i className="fa-solid fa-folder-open text-4xl text-slate-600 mb-4 block"></i>
                        <p className="text-slate-400 font-medium">Nenhum documento anexado</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentsSection;
