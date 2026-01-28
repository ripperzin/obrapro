import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Unit } from '../types';
import MoneyInput from './MoneyInput';
import BatchUnitPreview from './BatchUnitPreview';

interface AddUnitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (unit: Omit<Unit, 'id'> | Omit<Unit, 'id'>[]) => Promise<void>;
}

const AddUnitModal: React.FC<AddUnitModalProps> = ({ isOpen, onClose, onSave }) => {
    const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
    const [isSaving, setIsSaving] = useState(false);

    // Single Form State
    const [formData, setFormData] = useState({
        identifier: '',
        area: 0,
        cost: 0,
        valorEstimadoVenda: 0
    });

    // Batch Form State
    const [batchConfig, setBatchConfig] = useState({
        prefix: 'Apto',
        floors: 1,
        unitsPerFloor: 1,
        startNumber: 1,
        defaultArea: 50,
        defaultCost: 0,
        defaultSale: 0
    });

    const [previewUnits, setPreviewUnits] = useState<Omit<Unit, 'id'>[]>([]);

    const DRAFT_KEY = 'draft_new_unit';

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.tab) setActiveTab(parsed.tab);
                    if (parsed.single) setFormData(parsed.single);
                    if (parsed.batch) setBatchConfig(parsed.batch);
                } catch (e) {
                    console.error('Error parsing draft', e);
                }
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                tab: activeTab,
                single: formData,
                batch: batchConfig
            }));
        }
    }, [formData, batchConfig, activeTab, isOpen]);

    // Update preview when batch config changes
    useEffect(() => {
        if (activeTab === 'batch') {
            const generated: Omit<Unit, 'id'>[] = [];
            for (let f = 1; f <= batchConfig.floors; f++) {
                for (let u = 0; u < batchConfig.unitsPerFloor; u++) {
                    const unitNum = (f * 100) + (batchConfig.startNumber + u);
                    const prefix = (batchConfig.prefix || 'Unid').trim();
                    generated.push({
                        identifier: `${prefix} ${unitNum}`,
                        area: batchConfig.defaultArea || 0,
                        cost: batchConfig.defaultCost || 0,
                        valorEstimadoVenda: batchConfig.defaultSale || 0,
                        status: 'Available'
                    });
                }
            }
            setPreviewUnits(generated);
        }
    }, [batchConfig, activeTab]);

    const handleClose = () => {
        localStorage.removeItem(DRAFT_KEY);
        onClose();
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (activeTab === 'single') {
                await onSave({
                    ...formData,
                    status: 'Available'
                } as any);
                setFormData({ identifier: '', area: 0, cost: 0, valorEstimadoVenda: 0 });
            } else {
                await onSave(previewUnits);
            }
            localStorage.removeItem(DRAFT_KEY);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-700 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-house-user text-blue-400"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white">Adicionar Unidades</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Gestão de Portfólio</p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-slate-800/50 mx-6 mt-6 rounded-2xl border border-slate-700/50 shrink-0">
                    <button
                        onClick={() => setActiveTab('single')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'single' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Unidade Única
                    </button>
                    <button
                        onClick={() => setActiveTab('batch')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'batch' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                        Gerador em Lote
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                    {activeTab === 'single' ? (
                        <div className="space-y-4 animate-slide-up">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-blue-400 uppercase ml-3 tracking-widest">Identificador</label>
                                <input
                                    required
                                    autoFocus
                                    className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                                    placeholder="Ex: Apt 101, Casa A..."
                                    value={formData.identifier}
                                    onChange={e => setFormData({ ...formData, identifier: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-3 tracking-widest">Área (m²)</label>
                                    <input
                                        required
                                        type="number"
                                        className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                                        value={formData.area || ''}
                                        onChange={e => setFormData({ ...formData, area: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-3 tracking-widest">Custo Est.</label>
                                    <MoneyInput
                                        className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-right"
                                        value={formData.cost}
                                        onBlur={(val) => setFormData({ ...formData, cost: val })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-green-400 uppercase ml-3 tracking-widest">Venda Estimada</label>
                                <MoneyInput
                                    className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm"
                                    value={formData.valorEstimadoVenda}
                                    onBlur={(val) => setFormData({ ...formData, valorEstimadoVenda: val })}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-slide-up">
                            {/* Layout de Geração */}
                            <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-blue-400 uppercase ml-2 tracking-widest">Prefixo</label>
                                        <input
                                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white text-xs"
                                            value={batchConfig.prefix}
                                            placeholder="Ex: Apto"
                                            onChange={e => setBatchConfig({ ...batchConfig, prefix: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Início Num.</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white text-xs text-center"
                                            value={batchConfig.startNumber}
                                            onChange={e => setBatchConfig({ ...batchConfig, startNumber: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Andares</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white text-xs text-center"
                                            value={batchConfig.floors}
                                            onChange={e => setBatchConfig({ ...batchConfig, floors: Number(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Unid/Andar</label>
                                        <input
                                            type="number"
                                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white text-xs text-center"
                                            value={batchConfig.unitsPerFloor}
                                            onChange={e => setBatchConfig({ ...batchConfig, unitsPerFloor: Number(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Valores Padrão */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Área Padrão</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white text-xs text-center"
                                        value={batchConfig.defaultArea}
                                        onChange={e => setBatchConfig({ ...batchConfig, defaultArea: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2 tracking-widest">Custo Padrão</label>
                                    <MoneyInput
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white text-xs text-right"
                                        value={batchConfig.defaultCost}
                                        onBlur={(val) => setBatchConfig({ ...batchConfig, defaultCost: val })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-green-500/70 uppercase ml-2 tracking-widest">Venda Padrão</label>
                                <MoneyInput
                                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 focus:border-green-500 rounded-xl outline-none transition-all font-bold text-white text-xs"
                                    value={batchConfig.defaultSale}
                                    onBlur={(val) => setBatchConfig({ ...batchConfig, defaultSale: val })}
                                />
                            </div>

                            {/* Preview Section */}
                            <BatchUnitPreview
                                units={previewUnits}
                                onRemove={(idx) => setPreviewUnits(prev => prev.filter((_, i) => i !== idx))}
                                onUpdateValue={(idx, field, val) => {
                                    setPreviewUnits(prev => prev.map((u, i) => i === idx ? { ...u, [field]: val } : u));
                                }}
                            />
                        </div>
                    )}
                </form>

                <div className="p-6 border-t border-slate-700 bg-slate-900/95 shrink-0">
                    <button
                        type="submit"
                        disabled={isSaving || (activeTab === 'batch' && previewUnits.length === 0)}
                        onClick={handleSubmit}
                        className="w-full py-5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-xl shadow-blue-600/30 font-black uppercase text-sm tracking-[0.2em] flex items-center justify-center gap-3"
                    >
                        {isSaving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check-double"></i>}
                        {isSaving ? 'Salvando...' : activeTab === 'single' ? 'Criar Unidade' : `Criar ${previewUnits.length} Unidades`}
                    </button>
                    {activeTab === 'batch' && (
                        <p className="text-[9px] text-slate-500 font-bold uppercase text-center mt-3 tracking-widest opacity-60">
                            Os totais do projeto serão atualizados automaticamente
                        </p>
                    )}
                </div>
            </div>
        </div>,
        modalRoot
    );
};

export default AddUnitModal;
