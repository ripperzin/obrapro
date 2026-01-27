import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Unit } from '../types';
import MoneyInput from './MoneyInput';

interface AddUnitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (unit: Omit<Unit, 'id'>) => Promise<void>;
}

const AddUnitModal: React.FC<AddUnitModalProps> = ({ isOpen, onClose, onSave }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        identifier: '',
        area: 0,
        cost: 0,
        valorEstimadoVenda: 0
    });

    const DRAFT_KEY = 'draft_new_unit';

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
                try {
                    setFormData(JSON.parse(saved));
                } catch (e) {
                    console.error('Error parsing draft', e);
                }
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
        }
    }, [formData, isOpen]);

    const handleClose = () => {
        localStorage.removeItem(DRAFT_KEY);
        onClose();
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave({
                ...formData,
                status: 'Available',
                saleValue: undefined,
                saleDate: undefined
            } as any);
            localStorage.removeItem(DRAFT_KEY);
            onClose();
            setFormData({ identifier: '', area: 0, cost: 0, valorEstimadoVenda: 0 });
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
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-house-user text-blue-400"></i>
                        </div>
                        <h2 className="text-xl font-black text-white">Nova Unidade</h2>
                    </div>
                    <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Identificador</label>
                        <input
                            required
                            autoFocus
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                            placeholder="Ex: Apt 101, Casa A..."
                            value={formData.identifier}
                            onChange={e => setFormData({ ...formData, identifier: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Área (m²)</label>
                            <input
                                required
                                type="number"
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                                value={formData.area || ''}
                                onChange={e => setFormData({ ...formData, area: Number(e.target.value) })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Custo Est.</label>
                            <MoneyInput
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-right"
                                value={formData.cost}
                                onBlur={(val) => setFormData({ ...formData, cost: val })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-green-400 uppercase ml-3">Venda Estimada</label>
                        <MoneyInput
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm"
                            value={formData.valorEstimadoVenda}
                            onBlur={(val) => setFormData({ ...formData, valorEstimadoVenda: val })}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 mt-4"
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

export default AddUnitModal;
