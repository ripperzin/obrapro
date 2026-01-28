import React from 'react';
import { Unit } from '../types';
import { formatCurrency } from '../utils';

interface BatchUnitPreviewProps {
    units: Omit<Unit, 'id'>[];
    onRemove: (index: number) => void;
    onUpdateValue: (index: number, field: keyof Omit<Unit, 'id'>, value: any) => void;
}

const BatchUnitPreview: React.FC<BatchUnitPreviewProps> = ({ units, onRemove, onUpdateValue }) => {
    if (units.length === 0) return null;

    return (
        <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Preview das Unidades ({units.length})
                </h3>
                <span className="text-[10px] text-slate-600 font-bold italic">Role para ver mais</span>
            </div>

            <div className="max-h-60 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {units.map((unit, index) => (
                    <div key={index} className="group bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3 hover:border-blue-500/30 transition-all">
                        <div className="w-8 h-8 flex items-center justify-center bg-slate-700 rounded-lg text-[10px] font-black text-white shrink-0 group-hover:bg-blue-600 transition-colors">
                            {index + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                            <input
                                className="bg-transparent text-white font-bold text-sm w-full outline-none focus:text-blue-400"
                                value={unit.identifier}
                                onChange={(e) => onUpdateValue(index, 'identifier', e.target.value)}
                            />
                            <div className="flex gap-3 mt-1">
                                <span className="text-[10px] text-slate-500 font-bold">{unit.area}m²</span>
                                <span className="text-[10px] text-slate-400 font-bold">Custo: {formatCurrency(unit.cost)}</span>
                                <span className="text-[10px] text-green-500/70 font-bold">Venda: {formatCurrency(unit.valorEstimadoVenda || 0)}</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-red-400 transition"
                        >
                            <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default BatchUnitPreview;
