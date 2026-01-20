import React, { useState } from 'react';
import { ProjectDocument } from '../types';
import { openAttachment } from '../utils/storage';
import AttachmentUpload from './AttachmentUpload';

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
    const [isAdding, setIsAdding] = useState(false);
    const [newDoc, setNewDoc] = useState({
        title: '',
        category: 'Projeto' as ProjectDocument['category'],
        url: ''
    });

    const handleAdd = () => {
        if (!newDoc.title || !newDoc.url) {
            alert('Preencha o título e anexe o arquivo.');
            return;
        }
        onAdd(newDoc);
        setIsAdding(false);
        setNewDoc({ title: '', category: 'Projeto', url: '' });
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
                {isAdmin && !isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                    >
                        <i className="fa-solid fa-plus"></i> Novo Documento
                    </button>
                )}
            </div>

            {/* Formulário de Adição */}
            {isAdding && (
                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-4 animate-fade-in relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>

                    <h3 className="text-sm font-bold text-white uppercase mb-4">Novo Documento</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Título</label>
                            <input
                                type="text"
                                placeholder="Ex: Planta Baixa Térreo"
                                value={newDoc.title}
                                onChange={e => setNewDoc({ ...newDoc, title: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Categoria</label>
                            <select
                                value={newDoc.category}
                                onChange={e => setNewDoc({ ...newDoc, category: e.target.value as any })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors font-bold appearance-none cursor-pointer"
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase">Arquivo</label>
                        <AttachmentUpload
                            value={newDoc.url}
                            onChange={url => setNewDoc({ ...newDoc, url: url || '' })}
                            bucketName="project-documents"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleAdd}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider shadow-lg shadow-green-600/20 transition-all"
                        >
                            Salvar Documento
                        </button>
                        <button
                            onClick={() => setIsAdding(false)}
                            className="px-6 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

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
