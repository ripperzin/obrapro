import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ProjectMacro, ProjectItem, TemplateStageItem, Investor } from '../types';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import { ReceiptScanner } from './ReceiptScanner';
import { ReceiptData } from '../lib/gemini';
import { getSignedUrl, uploadFile } from '../utils/storage';
import { usePlan } from './PlanProvider';

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (expense: any) => void;
    macros: ProjectMacro[];
    items: ProjectItem[];              // lista plana de itens da obra ("o que comprei")
    stageItems?: TemplateStageItem[];  // preset: itens típicos de cada etapa (sugestão)
    investors?: Investor[];
    defaultPayerId?: string;
    // Criar ITEM inline, sem sair do modal. Retorna o id (existente, se já houver — dedupe).
    // Categoria (etapa/macro) NÃO é criada inline de propósito (criar no Orçamento).
    onCreateItem?: (name: string) => Promise<string | null>;
}

// Normaliza p/ busca: ignora maiúsculas e acentos ("caç" acha "Caçamba").
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ isOpen, onClose, onSave, macros, items, stageItems = [], investors = [], defaultPayerId, onCreateItem }) => {
    const { ent, openUpgrade } = usePlan();
    const [formData, setFormData] = useState({
        description: '',
        value: 0,
        date: new Date().toISOString().split('T')[0],
        attachmentUrl: undefined as string | undefined,
        attachments: [] as string[],
        macroId: '' as string,
        itemId: '' as string,
        paidByInvestorId: '' as string
    });
    const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
    const [isInitialized, setIsInitialized] = useState(false);
    const [itemQuery, setItemQuery] = useState('');   // texto digitado na busca de item
    const [itemOpen, setItemOpen] = useState(false);  // dropdown de itens aberto?

    const DRAFT_KEY = 'draft_new_expense';

    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem(DRAFT_KEY);
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    // Check if data actually has content (avoid restoring empty drafts)
                    const hasData = data.description || data.value > 0 || (data.attachments && data.attachments.length > 0);

                    if (hasData) {
                        // Automatic restore
                        setFormData(prev => ({
                            ...prev,
                            ...data,
                            // Ensure arrays/objects are properly merged or replaced
                            attachments: data.attachments || [],
                            macros: undefined,
                            subMacros: undefined
                        }));
                    }
                } catch (e) {
                    console.error('Error restoring draft', e);
                }
            } else {
                // Reset handled by initialized state logic usually
            }
            setResolvedUrls({});
            setIsInitialized(true);
        } else {
            setIsInitialized(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && isInitialized) {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
        }
    }, [formData, isOpen, isInitialized]);

    // Pré-seleciona o pagador padrão da obra ao abrir (só se ainda não houver escolha)
    useEffect(() => {
        if (isOpen && defaultPayerId) {
            setFormData(prev => (prev.paidByInvestorId ? prev : { ...prev, paidByInvestorId: defaultPayerId }));
        }
    }, [isOpen, defaultPayerId]);

    // Ao reabrir com item já escolhido (rascunho), mostra o nome dele na busca.
    useEffect(() => {
        if (isOpen && formData.itemId && !itemQuery) {
            const it = items.find(i => i.id === formData.itemId);
            if (it) setItemQuery(it.name);
        }
    }, [isOpen, formData.itemId, items]);

    // Resolve URLs
    useEffect(() => {
        const resolveParams = async () => {
            const newResolved: Record<string, string> = {};
            if (formData.attachments) {
                for (const path of formData.attachments) {
                    if (path.startsWith('http')) {
                        newResolved[path] = path;
                    } else {
                        const url = await getSignedUrl(path);
                        if (url) newResolved[path] = url;
                    }
                }
            }
            setResolvedUrls(newResolved);
        };
        resolveParams();
    }, [formData.attachments]);

    const handleScanComplete = async (data: ReceiptData, file: File) => {
        // Upload file automatically
        let attachmentPath = undefined;
        if (file) {
            const path = await uploadFile(file);
            if (path) {
                attachmentPath = path;
            }
        }

        // Prepare description
        let desc = data.description || '';
        if (data.merchant) {
            desc = desc ? `${data.merchant} - ${desc}` : data.merchant;
        }

        setFormData(prev => ({
            ...prev,
            date: data.date || prev.date,
            value: data.amount || prev.value,
            description: desc || prev.description,
            // Add new attachment specific to this scan
            attachments: attachmentPath ? [...(prev.attachments || []), attachmentPath] : prev.attachments
        }));
    };

    const handleClose = () => {
        localStorage.removeItem(DRAFT_KEY);
        onClose();
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.macroId) {
            alert('Por favor, selecione uma Categoria para a despesa.');
            return;
        }

        onSave({
            ...formData,
            attachmentUrl: formData.attachments.length > 0 ? formData.attachments[0] : undefined,
            macroId: formData.macroId,
            itemId: formData.itemId || undefined,
            paidByInvestorId: formData.paidByInvestorId || undefined
        });
        localStorage.removeItem(DRAFT_KEY);
        onClose();
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    // ── Item buscável: sugere primeiro os itens típicos da etapa, deixa achar todos ──
    const selectedMacroName = macros.find(m => m.id === formData.macroId)?.name || '';
    const selectedItem = items.find(it => it.id === formData.itemId);
    // Nomes de item típicos da etapa escolhida, na ordem do preset.
    const suggestedNames = stageItems
        .filter(si => si.macroName === selectedMacroName)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(si => si.itemName);
    const isSuggested = (name: string) =>
        suggestedNames.some(sn => normalize(sn) === normalize(name));
    const q = normalize(itemQuery);
    const matchesQuery = (it: ProjectItem) => !q || normalize(it.name).includes(q);
    // Itens típicos da etapa (na ordem do preset) que batem com a busca.
    const suggestedItems = suggestedNames
        .map(sn => items.find(it => normalize(it.name) === normalize(sn)))
        .filter((it): it is ProjectItem => !!it && matchesQuery(it));
    // Demais itens (fora do típico da etapa), em ordem alfabética.
    const otherItems = items
        .filter(it => !isSuggested(it.name) && matchesQuery(it))
        .sort((a, b) => a.name.localeCompare(b.name));

    const chooseItem = (id: string, name: string) => {
        setFormData(prev => ({ ...prev, itemId: id }));
        setItemQuery(name);
        setItemOpen(false);
    };
    const clearItem = () => {
        setFormData(prev => ({ ...prev, itemId: '' }));
        setItemQuery('');
    };
    // "+ Novo item…": pergunta o nome (já pré-preenche com o que foi digitado na busca).
    // onCreateItem faz dedupe — se o nome já existir, só seleciona o existente.
    const handleAddNewItem = async () => {
        if (!onCreateItem) return;
        const name = window.prompt('Nome do novo item:', itemQuery.trim())?.trim();
        if (!name) return;
        const newId = await onCreateItem(name);
        if (newId) chooseItem(newId, name);
    };

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                            <i className="fa-solid fa-wallet text-green-400"></i>
                        </div>
                        <h2 className="text-xl font-black text-white">Nova Despesa</h2>
                    </div>
                    <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    <div className="mb-4">
                        <ReceiptScanner onScanComplete={handleScanComplete} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Descrição</label>
                        <input
                            required
                            autoFocus
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                            placeholder="Ex: Cimento, Pintor..."
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Valor (R$)</label>
                            <MoneyInput
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm"
                                value={formData.value}
                                onBlur={(val) => setFormData({ ...formData, value: val })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Data</label>
                            <DateInput
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm text-center"
                                value={formData.date}
                                onChange={(val) => setFormData({ ...formData, date: val })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Etapa da obra</label>
                        <select
                            required
                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none font-bold text-white text-xs appearance-none cursor-pointer"
                            value={formData.macroId}
                            onChange={e => setFormData({ ...formData, macroId: e.target.value })}
                        >
                            <option value="" disabled>Selecione a etapa...</option>
                            {macros.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Item da obra — buscável. Sugere primeiro os itens típicos da etapa.
                        No Free vira uma faixa com cadeado (o item é do plano ObraPro). */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Item (o que comprei)</label>
                        {!ent.canUseItens ? (
                            <button
                                type="button"
                                onClick={() => openUpgrade('itens')}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/40 border-2 border-dashed border-slate-700 rounded-2xl text-left hover:border-amber-500/50 transition-colors"
                            >
                                <i className="fa-solid fa-lock text-amber-400 text-sm shrink-0"></i>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-white font-bold text-sm">Saiba no que você mais gasta</span>
                                    <span className="block text-slate-500 text-[11px]">Cimento, areia, frete... — faz parte do ObraPro</span>
                                </span>
                                <i className="fa-solid fa-chevron-right text-slate-600 text-xs shrink-0"></i>
                            </button>
                        ) : (
                        <div className="relative">
                            <div className="relative">
                                <input
                                    className="w-full pl-10 pr-9 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none transition-all font-bold text-white text-sm placeholder-slate-500"
                                    placeholder={formData.macroId ? 'Buscar item... ex: cimento, frete, caçamba' : 'Escolha a etapa primeiro'}
                                    value={itemQuery}
                                    disabled={!formData.macroId}
                                    onFocus={() => setItemOpen(true)}
                                    onChange={e => {
                                        setItemQuery(e.target.value);
                                        setItemOpen(true);
                                        if (formData.itemId) setFormData(prev => ({ ...prev, itemId: '' }));
                                    }}
                                    onBlur={() => setTimeout(() => setItemOpen(false), 150)}
                                />
                                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none"></i>
                                {(formData.itemId || itemQuery) && (
                                    <button
                                        type="button"
                                        onClick={clearItem}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-400"
                                    >
                                        <i className="fa-solid fa-xmark text-xs"></i>
                                    </button>
                                )}
                            </div>

                            {itemOpen && formData.macroId && (
                                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-slate-800 border-2 border-slate-700 rounded-2xl shadow-2xl">
                                    {suggestedItems.length > 0 && (
                                        <>
                                            <div className="px-4 pt-2 pb-1 text-[9px] font-black text-emerald-400/80 uppercase tracking-wider">Típicos desta etapa</div>
                                            {suggestedItems.map(it => (
                                                <button
                                                    key={it.id}
                                                    type="button"
                                                    onMouseDown={e => { e.preventDefault(); chooseItem(it.id, it.name); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm font-bold hover:bg-slate-700/70 transition flex items-center gap-2 ${formData.itemId === it.id ? 'text-green-400' : 'text-white'}`}
                                                >
                                                    <i className="fa-solid fa-star text-emerald-400/60 text-[9px]"></i>
                                                    {it.name}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {otherItems.length > 0 && (
                                        <>
                                            <div className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                                                {suggestedItems.length > 0 ? 'Outros itens' : 'Itens'}
                                            </div>
                                            {otherItems.map(it => (
                                                <button
                                                    key={it.id}
                                                    type="button"
                                                    onMouseDown={e => { e.preventDefault(); chooseItem(it.id, it.name); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm font-bold hover:bg-slate-700/70 transition ${formData.itemId === it.id ? 'text-green-400' : 'text-slate-200'}`}
                                                >
                                                    {it.name}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                    {suggestedItems.length === 0 && otherItems.length === 0 && (
                                        <div className="px-4 py-3 text-xs text-slate-500">Nenhum item na busca — use "Novo item" abaixo.</div>
                                    )}
                                    {onCreateItem && (
                                        <button
                                            type="button"
                                            onMouseDown={e => { e.preventDefault(); handleAddNewItem(); }}
                                            className="sticky bottom-0 z-10 w-full text-left px-4 py-3 text-sm font-black text-emerald-400 bg-slate-800 hover:bg-slate-700 transition border-t border-slate-700 flex items-center gap-2 shadow-[0_-6px_12px_-4px_rgba(0,0,0,0.5)]"
                                        >
                                            <i className="fa-solid fa-plus text-[10px]"></i> Novo item…
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        )}
                        {ent.canUseItens && (
                            <p className="text-[10px] text-slate-500 ml-3">Opcional — ajuda a ver no que você mais gasta.</p>
                        )}
                    </div>

                    {investors.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Pago por</label>
                            <select
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-green-500 rounded-2xl outline-none font-bold text-white text-xs appearance-none cursor-pointer"
                                value={formData.paidByInvestorId}
                                onChange={e => setFormData({ ...formData, paidByInvestorId: e.target.value })}
                            >
                                <option value="">Caixa da obra</option>
                                {investors.map(inv => (
                                    <option key={inv.id} value={inv.id}>{inv.name} (do próprio bolso)</option>
                                ))}
                            </select>
                            {formData.paidByInvestorId && (
                                <p className="text-[10px] text-amber-400/80 ml-3 flex items-center gap-1">
                                    <i className="fa-solid fa-circle-info"></i>
                                    Não sai do caixa — conta como aporte do sócio.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Anexos ({formData.attachments?.length || 0})</label>

                        {/* Grid de Anexos */}
                        {formData.attachments && formData.attachments.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 mb-2">
                                {formData.attachments.map((path, index) => {
                                    const url = resolvedUrls[path] || path;
                                    return (
                                        <div key={index} className="relative aspect-square bg-slate-700 rounded-xl overflow-hidden border border-slate-600 group">
                                            {/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(path) ? (
                                                <div className="w-full h-full relative">
                                                    <img
                                                        src={url}
                                                        className="w-full h-full object-cover"
                                                        alt="anexo"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                                                    <i className="fa-solid fa-file-pdf text-xl"></i>
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (window.confirm('Tem certeza que deseja excluir este anexo?')) {
                                                        const newAttachments = formData.attachments!.filter((_, i) => i !== index);
                                                        setFormData({ ...formData, attachments: newAttachments });
                                                    }
                                                }}
                                                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-lg flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-10"
                                            >
                                                <i className="fa-solid fa-xmark text-xs"></i>
                                            </button>

                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 truncate text-[8px] text-white text-center">
                                                Anexo {index + 1}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="h-16">
                            <AttachmentUpload
                                value={undefined}
                                onChange={(url) => {
                                    if (url) {
                                        setFormData(prev => ({
                                            ...prev,
                                            attachments: [...(prev.attachments || []), url]
                                        }));
                                    }
                                }}
                                minimal={false}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition shadow-lg shadow-green-600/30 font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 mt-4"
                    >
                        <i className="fa-solid fa-check"></i> Salvar Despesa
                    </button>
                </form>
            </div>
        </div>,
        modalRoot
    );
};

export default AddExpenseModal;
