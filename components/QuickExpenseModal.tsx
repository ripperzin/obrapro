import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import { supabase } from '../supabaseClient';

interface QuickExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    preSelectedProjectId?: string | null;
    onSave: (projectId: string, expense: any) => void;
    initialDescription?: string;
    initialValue?: number;
    initialOriginalText?: string;
}

interface MacroOption {
    id: string;
    name: string;
}

interface SubMacroOption {
    id: string;
    name: string;
    macroId: string;
}

const QuickExpenseModal: React.FC<QuickExpenseModalProps> = ({
    isOpen,
    onClose,
    projects,
    preSelectedProjectId,
    onSave,
    initialDescription = '',
    initialValue = 0,
    initialOriginalText = ''
}) => {
    const [projectId, setProjectId] = useState(preSelectedProjectId || '');
    const [description, setDescription] = useState(initialDescription);
    const [value, setValue] = useState(initialValue);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>(undefined);

    // Categories State
    const [macros, setMacros] = useState<MacroOption[]>([]);
    const [subMacros, setSubMacros] = useState<SubMacroOption[]>([]);
    const [selectedMacroId, setSelectedMacroId] = useState<string>('');
    const [selectedSubMacroId, setSelectedSubMacroId] = useState<string>('');
    const [loadingCategories, setLoadingCategories] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setProjectId(preSelectedProjectId || (projects.length > 0 ? projects[0].id : ''));
            setDescription(initialDescription);
            setValue(initialValue);
            setDate(new Date().toISOString().split('T')[0]);
            setAttachmentUrl(undefined);
            setSelectedMacroId('');
            setSelectedSubMacroId('');
        }
    }, [isOpen, preSelectedProjectId, initialDescription, initialValue, projects]);

    // Fetch Macros when Project Changes
    useEffect(() => {
        if (projectId && isOpen) {
            fetchCategories(projectId);
        } else {
            setMacros([]);
            setSubMacros([]);
        }
    }, [projectId, isOpen]);

    const fetchCategories = async (pid: string) => {
        setLoadingCategories(true);
        try {
            // 1. Get Budget ID
            const { data: budget } = await supabase
                .from('project_budgets')
                .select('id')
                .eq('project_id', pid)
                .single();

            if (budget) {
                // 2. Get Macros
                const { data: macroData } = await supabase
                    .from('project_macros')
                    .select('id, name')
                    .eq('budget_id', budget.id)
                    .order('display_order');

                if (macroData) {
                    setMacros(macroData);
                    const macroIds = macroData.map(m => m.id);

                    // 3. Get SubMacros
                    if (macroIds.length > 0) {
                        const { data: subData } = await supabase
                            .from('project_sub_macros')
                            .select('id, name, project_macro_id')
                            .in('project_macro_id', macroIds)
                            .order('display_order');

                        if (subData) {
                            const formattedSubs = subData.map(s => ({
                                id: s.id,
                                name: s.name,
                                macroId: s.project_macro_id
                            }));
                            setSubMacros(formattedSubs);

                            // Trigger Intelligent Matching once data is loaded
                            matchCategories(initialOriginalText, macroData, formattedSubs);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
        setLoadingCategories(false);
    };

    // INTELLIGENT MATCHING LOGIC
    const matchCategories = (text: string, loadedMacros: MacroOption[], loadedSubs: SubMacroOption[]) => {
        if (!text) return;

        const cleanText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        console.log('🔍 Analyzing text for keywords:', cleanText);

        let bestMacroId = '';
        let bestSubMacroId = '';

        // 1. Check SubMacros first (more specific)
        for (const sub of loadedSubs) {
            const subName = sub.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            // Heuristic: check if sub name (e.g. "cimento") is in text
            if (cleanText.includes(subName)) {
                bestSubMacroId = sub.id;
                bestMacroId = sub.macroId; // Auto-select parent
                console.log(`✅ Match found: Submacro "${sub.name}" inside "${cleanText}"`);
                break; // Stop at first match or find all and score? First match is usually ok for now.
            }
        }

        // 2. If no SubMacro match, check Macros
        if (!bestMacroId) {
            for (const macro of loadedMacros) {
                const macroName = macro.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (cleanText.includes(macroName)) {
                    bestMacroId = macro.id;
                    console.log(`✅ Match found: Macro "${macro.name}" inside "${cleanText}"`);
                    break;
                }
            }
        }

        if (bestMacroId) setSelectedMacroId(bestMacroId);
        if (bestSubMacroId) setSelectedSubMacroId(bestSubMacroId);
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectId) {
            alert('Selecione uma obra.');
            return;
        }
        onSave(projectId, {
            description,
            value,
            date,
            attachmentUrl,
            macroId: selectedMacroId || null,
            subMacroId: selectedSubMacroId || null
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-receipt text-green-400"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white leading-none">Despesa Rápida</h2>
                            <p className="text-xs text-green-400 font-bold mt-1">Comando de Voz</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 hover:border-red-400 transition"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="p-6 pb-0">
                    {initialOriginalText && (
                        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl mb-4">
                            <p className="text-xs text-blue-300 font-bold uppercase mb-1">Texto Reconhecido:</p>
                            <p className="text-sm text-blue-100 italic">"{initialOriginalText}"</p>
                            {(selectedMacroId || selectedSubMacroId) && (
                                <div className="mt-2 flex gap-2">
                                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-1 rounded-full border border-green-500/30">
                                        <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>
                                        Sugestão Automática
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="p-6 pt-0 space-y-5">
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

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
                        <input
                            required
                            autoFocus
                            type="text"
                            placeholder="O que foi comprado?"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                        />
                    </div>

                    {/* Category Selection (Smart) */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                                Categoria {loadingCategories && <i className="fa-solid fa-spinner fa-spin ml-1"></i>}
                            </label>
                            <select
                                value={selectedMacroId}
                                onChange={e => {
                                    setSelectedMacroId(e.target.value);
                                    setSelectedSubMacroId(''); // Reset sub on macro change
                                }}
                                disabled={loadingCategories}
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none font-bold text-white text-xs appearance-none cursor-pointer"
                            >
                                <option value="">Sem categoria</option>
                                {macros.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                                Detalhe
                            </label>
                            <select
                                value={selectedSubMacroId}
                                onChange={e => setSelectedSubMacroId(e.target.value)}
                                disabled={!selectedMacroId || loadingCategories}
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none font-bold text-white text-xs appearance-none cursor-pointer disabled:opacity-50"
                            >
                                <option value="">Sem detalhe</option>
                                {subMacros
                                    .filter(s => s.macroId === selectedMacroId)
                                    .map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Valor</label>
                            <MoneyInput
                                value={value}
                                onBlur={(val) => setValue(val)}
                                className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
                            <DateInput
                                value={date}
                                onChange={setDate}
                                className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                            />
                        </div>
                    </div>

                    <AttachmentUpload
                        label="Foto do Comprovante (Opcional)"
                        currentUrl={attachmentUrl}
                        onUpload={setAttachmentUrl}
                        onRemove={() => setAttachmentUrl(undefined)}
                    />

                    <button
                        type="submit"
                        className="w-full py-4 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition shadow-lg shadow-green-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2"
                    >
                        <i className="fa-solid fa-check"></i>
                        Salvar Despesa
                    </button>
                </form>
            </div>
        </div>
    );
};

export default QuickExpenseModal;
