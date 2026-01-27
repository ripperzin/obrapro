import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Project, Unit } from '../types';
import MoneyInput from './MoneyInput';

interface QuickUnitModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    preSelectedProjectId?: string | null;
    onSave: (projectId: string, unit: Omit<Unit, 'id'>) => Promise<void>;
    initialIdentifier?: string;
    initialArea?: number;
    initialCost?: number;
    initialSalePrice?: number;
}

const QuickUnitModal: React.FC<QuickUnitModalProps> = ({
    isOpen,
    onClose,
    projects,
    preSelectedProjectId,
    onSave,
    initialIdentifier = '',
    initialArea = 0,
    initialCost = 0,
    initialSalePrice = 0
}) => {
    const [projectId, setProjectId] = useState(preSelectedProjectId || '');
    const [identifier, setIdentifier] = useState(initialIdentifier);
    const [area, setArea] = useState(initialArea);
    const [cost, setCost] = useState(initialCost);
    const [salePrice, setSalePrice] = useState(initialSalePrice);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setProjectId(preSelectedProjectId || (projects.length > 0 ? projects[0].id : ''));
            setIdentifier(initialIdentifier);
            setArea(initialArea);
            setCost(initialCost);
            setSalePrice(initialSalePrice);
        }
    }, [isOpen, preSelectedProjectId, initialIdentifier, initialArea, initialCost, initialSalePrice, projects]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectId) {
            alert('Selecione uma obra.');
            return;
        }

        setIsSaving(true);
        try {
            await onSave(projectId, {
                identifier,
                area,
                cost,
                valorEstimadoVenda: salePrice,
                status: 'Available'
            } as any);
            onClose();
        } catch (error) {
            console.error('Erro ao salvar unidade:', error);
            alert('Erro ao salvar unidade.');
        } finally {
            setIsSaving(false);
        }
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-house-user text-blue-400"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white leading-none">Nova Unidade</h2>
                            <p className="text-xs text-blue-400 font-bold mt-1">Confirmação da IA</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition"
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

                    {/* Identifier */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Identificador</label>
                        <input
                            required
                            autoFocus
                            type="text"
                            placeholder="Ex: Casa 01, Apto 101..."
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                        />
                    </div>

                    {/* Area and Cost */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Área (m²)</label>
                            <input
                                required
                                type="number"
                                placeholder="0"
                                value={area || ''}
                                onChange={e => setArea(Number(e.target.value))}
                                className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-4">Custo Est.</label>
                            <MoneyInput
                                value={cost}
                                onBlur={(val) => setCost(val)}
                                className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-right"
                            />
                        </div>
                    </div>

                    {/* Sale Price */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-green-400 uppercase tracking-widest ml-4">Venda Estimada</label>
                        <MoneyInput
                            value={salePrice}
                            onBlur={(val) => setSalePrice(val)}
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className={`w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 mt-4 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                        {isSaving ? 'Salvando...' : 'Criar Unidade'}
                    </button>
                </form>
            </div>
        </div>,
        modalRoot
    );
};

export default QuickUnitModal;
