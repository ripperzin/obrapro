import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useToast } from './ToastProvider';
import DateInput from './DateInput';
import MoneyInput from './MoneyInput';
import { formatCurrency } from '../utils';
import { useCreateObra } from '../hooks/useCreateObra';
import { useProjects } from '../hooks/useProjects';
import { useTemplateStages, TemplateStage } from '../hooks/useTemplateStages';
import { custoM2Realizado } from '../utils/projectFinance';

interface Props {
    onClose: () => void;
    onCreated: (id: string) => void;
    userId?: string;
    userName?: string;
}

// UF como lista fechada (enum curto) — não texto livre. É o que amarra a obra a
// uma região para os comparativos futuros; "SP"/"sp"/"São Paulo" digitados soltos
// tornariam a base regional inutilizável.
const UF_LIST = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

// Cidade = lista fechada do IBGE por UF (autocomplete), pra o dado nascer limpo e
// a base regional (custo por cidade) funcionar depois — texto livre viraria a mesma
// cidade escrita de N jeitos. Cache por sessão; offline/erro cai em texto livre.
const cityCache: Record<string, string[]> = {};
const normalizeCity = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// Bloco opcional recolhível — mantém a criação leve, expandindo só o que o usuário quer.
const Section: React.FC<{
    icon: string;
    color: string; // classe de cor (ex: 'text-amber-400')
    title: string;
    hint?: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}> = ({ icon, color, title, hint, open, onToggle, children }) => (
    <div className="border border-slate-700 rounded-2xl overflow-hidden">
        <button type="button" onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800 transition">
            <span className="flex items-center gap-2">
                <i className={`fa-solid ${icon} ${color}`}></i>
                <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest">{title}</span>
                {hint && <span className="text-[10px] text-slate-500 normal-case font-bold">· {hint}</span>}
            </span>
            <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-slate-500 text-xs`}></i>
        </button>
        {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
);

/**
 * Modal ÚNICO de "Nova Obra". Essencial sempre visível (modo, nome, datas) +
 * blocos opcionais colapsáveis: Terreno, Unidades/custo-m², e Situação atual
 * (modo "já em andamento"). Usado no ProjectsDashboard e no GeneralDashboard.
 */
const NewObraModal: React.FC<Props> = ({ onClose, onCreated, userId, userName }) => {
    const toast = useToast();
    const [mode, setMode] = useState<'nova' | 'andamento'>('nova');
    const [name, setName] = useState('');
    const [city, setCity] = useState('');
    const [uf, setUf] = useState('');
    const [cityOptions, setCityOptions] = useState<string[]>([]); // municípios do IBGE da UF
    const [cityOpen, setCityOpen] = useState(false);              // dropdown do autocomplete
    const [startDate, setStartDate] = useState('');
    const [deliveryDate, setDeliveryDate] = useState('');
    const [unitTypes, setUnitTypes] = useState<{ quantidade: string; area: string }[]>([{ quantidade: '', area: '' }]);
    const [custoM2, setCustoM2] = useState(0);
    const [manualBudget, setManualBudget] = useState(0); // valor total digitado direto (nova do zero, sem unidades)
    // Como o orçamento é informado no modo "nova do zero": pelo valor total (+ nº de
    // casas, opcional) OU por m² (unidades × custo/m²). Só um método por vez — evita a
    // confusão de ter todos os campos abertos juntos.
    const [budgetMethod, setBudgetMethod] = useState<'total' | 'm2'>('total');
    const [casasQtd, setCasasQtd] = useState(''); // nº de casas no método "valor total"
    const [saving, setSaving] = useState(false);

    // Terreno (aquisição)
    const [terreno, setTerreno] = useState(0);
    const [terrenoPago, setTerrenoPago] = useState(false); // default: já era seu (não sai do caixa)

    // Situação atual (modo "já em andamento")
    const [openBudget, setOpenBudget] = useState(0);
    const [openProgress, setOpenProgress] = useState('');
    const [openAportado, setOpenAportado] = useState(0);
    const [openGasto, setOpenGasto] = useState(0);

    // Blocos abertos
    const [showTerreno, setShowTerreno] = useState(false);
    const [showUnidades, setShowUnidades] = useState(true);
    const [showSituacao, setShowSituacao] = useState(false);
    const [showEtapas, setShowEtapas] = useState(false);

    const createObra = useCreateObra();
    const { data: projects } = useProjects();

    // Cidades do IBGE para a UF escolhida (autocomplete). Trocar a UF zera a cidade
    // (a cidade tem que casar com a UF). Cache por sessão; offline/erro = texto livre.
    useEffect(() => {
        setCity('');
        if (!uf) { setCityOptions([]); return; }
        if (cityCache[uf]) { setCityOptions(cityCache[uf]); return; }
        let cancel = false;
        (async () => {
            try {
                const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
                if (!resp.ok) return;
                const data = await resp.json();
                const nomes: string[] = (data || []).map((m: any) => m.nome).filter(Boolean);
                cityCache[uf] = nomes;
                if (!cancel) setCityOptions(nomes);
            } catch { /* offline / falha: mantém texto livre */ }
        })();
        return () => { cancel = true; };
    }, [uf]);

    // Régua do orçamento: começa no preset do banco (o mesmo que semeia a obra)
    // e o usuário pode ajustar aqui mesmo. `null` = ainda não mexeu.
    const { data: templateStages } = useTemplateStages();
    const [editedStages, setEditedStages] = useState<TemplateStage[] | null>(null);
    const [moldeSource, setMoldeSource] = useState<string | null>(null); // nome da obra da qual a régua foi puxada
    const stages = editedStages ?? templateStages ?? [];
    const pctDirty = editedStages !== null;

    const updateStagePct = (idx: number, value: string) => {
        const base = editedStages ?? templateStages ?? [];
        const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
        setEditedStages(base.map((s, i) => (i === idx ? { ...s, percentage: pct } : s)));
    };
    const resetStages = () => { setEditedStages(null); setMoldeSource(null); };

    const soma = stages.reduce((s, x) => s + (x.percentage || 0), 0);
    const somaOk = Math.abs(soma - 100) < 0.05;

    // Referência de R$/m²: obras CONCLUÍDAS (o usuário escolhe de qual puxar).
    // Oferece o que a obra REALMENTE custou (gasto ÷ área), não o R$/m² que foi
    // estimado na criação dela — senão a obra nova repete o erro da anterior.
    // Só cai no estimado quando não há como saber o real (sem gasto ou sem metragem).
    const obrasRefM2 = [...(projects || [])]
        .reverse()
        .filter(p => p.progress >= 100)
        .map(p => {
            const real = custoM2Realizado(p);
            return { id: p.id, name: p.name, valor: real || (p.custoM2 || 0), ehReal: real > 0 };
        })
        .filter(o => o.valor > 0);

    // MOLDE de obra concluída: a régua REAL por etapa (quanto cada etapa custou
    // de verdade ÷ total gasto). Só entram obras 100% E que têm gasto por etapa —
    // senão o molde viria zerado (obras antigas com a despesa lançada "num monte
    // só", sem etapa). É o "aprender da obra concluída pra alimentar a próxima".
    const obrasMolde = [...(projects || [])]
        .reverse()
        .filter(p => p.progress >= 100)
        .map(p => {
            const macros = p.budget?.macros || [];
            const totalSpent = macros.reduce((s, m) => s + (m.spentValue || 0), 0);
            if (totalSpent <= 0) return null;
            const reguaByOrder: Record<number, number> = {};
            macros.forEach(m => { reguaByOrder[m.displayOrder] = (m.spentValue || 0) / totalSpent * 100; });
            const etapasComGasto = macros.filter(m => (m.spentValue || 0) > 0).length;
            return { id: p.id, name: p.name, reguaByOrder, etapasComGasto };
        })
        .filter((o): o is { id: string; name: string; reguaByOrder: Record<number, number>; etapasComGasto: number } => o !== null);

    // Aplica a régua real da obra escolhida sobre as etapas do preset (casa por
    // displayOrder). Joga a sobra do arredondamento na maior etapa pra fechar 100%.
    const applyMolde = (obraId: string) => {
        const o = obrasMolde.find(x => x.id === obraId);
        const base = templateStages ?? [];
        if (!o || base.length === 0) return;
        const rounded = base.map(s => ({ ...s, percentage: Math.round((o.reguaByOrder[s.displayOrder] ?? 0) * 10) / 10 }));
        const sum = rounded.reduce((a, s) => a + s.percentage, 0);
        const diff = Math.round((100 - sum) * 10) / 10;
        if (diff !== 0) {
            let maxI = 0;
            rounded.forEach((s, i) => { if (s.percentage > rounded[maxI].percentage) maxI = i; });
            rounded[maxI] = { ...rounded[maxI], percentage: Math.round((rounded[maxI].percentage + diff) * 10) / 10 };
        }
        setEditedStages(rounded);
        setMoldeSource(o.name);
    };

    const totalUnits = unitTypes.reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0);
    const totalArea = unitTypes.reduce((s, t) => s + (parseInt(t.quantidade) || 0) * (parseFloat(t.area) || 0), 0);
    const totalCost = totalArea * (custoM2 || 0);
    const hasConstrucao = totalUnits > 0 && custoM2 > 0;
    const casasN = parseInt(casasQtd) || 0; // nº de casas no método "valor total"
    const openSaldo = openAportado - openGasto;
    // Orçamento total da obra conforme modo/método:
    //  · andamento → das unidades (se detalhou) ou do valor informado;
    //  · nova + "por m²" → unidades × custo/m²;
    //  · nova + "valor total" → o valor digitado.
    const budgetTotal = mode === 'andamento'
        ? (hasConstrucao ? totalCost : openBudget)
        : (budgetMethod === 'm2' ? totalCost : manualBudget);

    const addUnitType = () => setUnitTypes([...unitTypes, { quantidade: '', area: '' }]);
    const removeUnitType = (idx: number) => setUnitTypes(unitTypes.filter((_, i) => i !== idx));
    const updateUnitType = (idx: number, field: 'quantidade' | 'area', value: string) =>
        setUnitTypes(unitTypes.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));

    const switchMode = (m: 'nova' | 'andamento') => {
        setMode(m);
        if (m === 'andamento') setShowSituacao(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (!city.trim() || !uf) { toast.error('Informe a cidade e o estado (UF) da obra.'); return; }
        // Método "valor total" (só na nova do zero): as casas vêm do nº informado
        // (área 0, custo = rateio do total no useCreateObra) e não há custo/m².
        const usaValorTotal = mode === 'nova' && budgetMethod === 'total';
        const submitUnitTypes = usaValorTotal
            ? (casasN > 0 ? [{ quantidade: casasN, area: 0 }] : [])
            : unitTypes.map(t => ({ quantidade: parseInt(t.quantidade) || 0, area: parseFloat(t.area) || 0 }));
        const submitCustoM2 = usaValorTotal ? 0 : custoM2;
        try {
            setSaving(true);
            const res = await createObra.mutateAsync({
                name: name.trim(),
                city: city.trim(),
                uf,
                startDate: startDate || undefined,
                deliveryDate: deliveryDate || undefined,
                unitTypes: submitUnitTypes,
                custoM2: submitCustoM2,
                userId: userId || '',
                userName: userName || 'Usuário',
                terrenoValue: terreno,
                terrenoPaidFromProject: terrenoPago,
                // Só manda se ele mexeu — senão o preset do banco já é o que vale.
                ...(pctDirty ? {
                    stagePercentages: stages.map(s => ({ displayOrder: s.displayOrder, percentage: s.percentage })),
                } : {}),
                ...(mode === 'andamento' ? {
                    // Se detalhou unidades, o orçamento vem delas; senão, do valor informado.
                    openingBudget: hasConstrucao ? 0 : openBudget,
                    openingProgress: parseInt(openProgress) || 0,
                    openingAportado: openAportado,
                    openingGasto: openGasto,
                } : (usaValorTotal && manualBudget > 0 ? {
                    // Nova do zero, "valor total": o valor digitado vira o orçamento. O
                    // useCreateObra usa openingBudget como total quando não há custo/m²
                    // (e rateia entre as casas). Sem gasto/aporte de abertura.
                    openingBudget: manualBudget,
                } : {})),
            });
            onClose();
            if (res?.id) onCreated(res.id);
        } catch (err: any) {
            toast.error('Erro ao criar obra: ' + (err.message || err));
            setSaving(false);
        }
    };

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in border border-slate-700">
                <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Nova Obra</h2>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 hover:border-red-400 transition">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
                    {/* Modo: obra nova (do zero) x obra já em andamento */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/60 rounded-2xl border border-slate-700">
                        <button type="button" onClick={() => switchMode('nova')}
                            className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${mode === 'nova' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white'}`}>
                            Nova do zero
                        </button>
                        <button type="button" onClick={() => switchMode('andamento')}
                            className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${mode === 'andamento' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white'}`}>
                            Já em andamento
                        </button>
                    </div>

                    {/* Essencial */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-2">Nome do Empreendimento</label>
                        <input required type="text" value={name} onChange={e => setName(e.target.value)}
                            placeholder="Ex: Residencial Aurora"
                            className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white shadow-sm text-sm placeholder-slate-500" />
                    </div>

                    {/* UF (lista fechada) + Cidade (autocomplete do IBGE por UF) — onde a
                        obra fica. Dado limpo pra comparar com a região no futuro. */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">UF</label>
                            <select required value={uf} onChange={e => setUf(e.target.value)}
                                className="w-full px-3 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white shadow-sm text-sm cursor-pointer">
                                <option value="">—</option>
                                {UF_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2 space-y-2 relative">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Cidade</label>
                            <input required type="text" value={city} disabled={!uf}
                                onChange={e => { setCity(e.target.value); setCityOpen(true); }}
                                onFocus={() => setCityOpen(true)}
                                onBlur={() => setTimeout(() => setCityOpen(false), 150)}
                                placeholder={uf ? 'Comece a digitar…' : 'Escolha a UF primeiro'}
                                autoComplete="off"
                                className="w-full px-5 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white shadow-sm text-sm placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                            {cityOpen && uf && cityOptions.length > 0 && (() => {
                                const q = normalizeCity(city);
                                const matches = cityOptions.filter(c => normalizeCity(c).includes(q)).slice(0, 8);
                                if (matches.length === 0) return null;
                                return (
                                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                                        {matches.map(c => (
                                            <button type="button" key={c}
                                                onMouseDown={() => { setCity(c); setCityOpen(false); }}
                                                className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800 transition">
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
                            <DateInput value={startDate} onChange={setStartDate}
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white shadow-sm text-sm text-center" placeholder="DD/MM/AAAA" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Entrega</label>
                            <DateInput value={deliveryDate} onChange={setDeliveryDate}
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-white shadow-sm text-sm text-center" placeholder="DD/MM/AAAA" />
                        </div>
                    </div>

                    {/* ORÇAMENTO DA OBRA (modo "nova do zero"): escolha de método — valor
                        total OU por m². Só aparece o método escolhido, pra não confundir
                        com todos os campos abertos ao mesmo tempo. As casas são criadas
                        nos dois casos (no "valor total" o custo de cada uma é o rateio). */}
                    {mode === 'nova' && (
                        <div className="border border-slate-700 rounded-2xl p-4 space-y-4">
                            <div className="flex items-center gap-2">
                                <i className="fa-solid fa-sack-dollar text-emerald-400"></i>
                                <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest">Orçamento da obra</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/60 rounded-xl border border-slate-700">
                                <button type="button" onClick={() => setBudgetMethod('total')}
                                    className={`py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${budgetMethod === 'total' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    Valor total
                                </button>
                                <button type="button" onClick={() => setBudgetMethod('m2')}
                                    className={`py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${budgetMethod === 'm2' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    Por m²
                                </button>
                            </div>

                            {budgetMethod === 'total' ? (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor total da obra</label>
                                        <MoneyInput value={manualBudget} onChange={setManualBudget}
                                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº de casas <span className="text-slate-600 normal-case">· opcional</span></label>
                                        <input type="number" min="0" inputMode="numeric" value={casasQtd}
                                            onChange={e => setCasasQtd(e.target.value)} placeholder="Ex: 12"
                                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm text-center" />
                                        <p className="text-[11px] text-slate-500 ml-1">Pra acompanhar vendas e estoque. O custo de cada casa é o rateio do total.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {unitTypes.map((t, idx) => (
                                        <div key={idx} className="flex gap-2 items-end">
                                            <div className="flex-1 space-y-1">
                                                {idx === 0 && <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Qtd. casas</label>}
                                                <input type="number" min="0" inputMode="numeric" value={t.quantidade}
                                                    onChange={e => updateUnitType(idx, 'quantidade', e.target.value)} placeholder="Ex: 10"
                                                    className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm text-center" />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                {idx === 0 && <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">m² de cada</label>}
                                                <input type="number" min="0" inputMode="decimal" value={t.area}
                                                    onChange={e => updateUnitType(idx, 'area', e.target.value)} placeholder="Ex: 50"
                                                    className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm text-center" />
                                            </div>
                                            {unitTypes.length > 1 && (
                                                <button type="button" onClick={() => removeUnitType(idx)}
                                                    className="w-11 h-11 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-red-400 shrink-0">
                                                    <i className="fa-solid fa-xmark"></i>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={addUnitType}
                                        className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-2">
                                        <i className="fa-solid fa-plus"></i> adicionar tipo de casa (m² diferente)
                                    </button>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custo por m²</label>
                                        {obrasRefM2.length > 0 && (
                                            <select value="" onChange={e => { const v = parseFloat(e.target.value); if (v) setCustoM2(v); }}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-blue-400 text-[11px] cursor-pointer">
                                                <option value="">↧ puxar R$/m² de uma obra concluída…</option>
                                                {obrasRefM2.map(o => (
                                                    <option key={o.id} value={o.valor}>
                                                        {o.name} — {formatCurrency(o.valor)}/m² {o.ehReal ? '(custo real)' : '(estimado)'}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        <MoneyInput value={custoM2} onChange={setCustoM2}
                                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm" />
                                    </div>
                                    {hasConstrucao && (
                                        <div className="bg-slate-800/60 rounded-2xl p-4 border border-emerald-500/30 space-y-1">
                                            <p className="text-center text-white font-bold text-sm">
                                                {totalUnits} casa{totalUnits > 1 ? 's' : ''} · {totalArea.toLocaleString('pt-BR')} m²
                                            </p>
                                            <p className="text-center text-emerald-400 font-black text-xl">{formatCurrency(totalCost)}</p>
                                            <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest">Orçamento total</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Terreno (opcional) */}
                    <Section icon="fa-map-location-dot" color="text-amber-400" title="Terreno" hint="opcional"
                        open={showTerreno} onToggle={() => setShowTerreno(v => !v)}>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor do terreno</label>
                            <MoneyInput value={terreno} onChange={setTerreno}
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-amber-500 rounded-xl outline-none font-bold text-white text-sm" />
                        </div>
                        <button type="button" onClick={() => setTerrenoPago(!terrenoPago)}
                            className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-left">
                            <div>
                                <p className="text-white font-bold text-sm">Pago pela obra?</p>
                                <p className="text-slate-500 text-[11px]">{terrenoPago ? 'Saiu do caixa (dos aportes)' : 'Já era seu / entrada de sócio'}</p>
                            </div>
                            <span className={`w-12 h-7 rounded-full flex items-center transition-all ${terrenoPago ? 'bg-amber-500 justify-end' : 'bg-slate-600 justify-start'} p-1`}>
                                <span className="w-5 h-5 bg-white rounded-full block"></span>
                            </span>
                        </button>
                    </Section>

                    {/* Unidades e custo/m² — modo "já em andamento" (o modo nova usa o
                        bloco de Orçamento acima com o toggle Valor total × Por m²). */}
                    {mode === 'andamento' && (
                    <Section icon="fa-ruler-combined" color="text-emerald-400" title="Unidades e custo/m²" hint="opcional"
                        open={showUnidades} onToggle={() => setShowUnidades(v => !v)}>
                        {unitTypes.map((t, idx) => (
                            <div key={idx} className="flex gap-2 items-end">
                                <div className="flex-1 space-y-1">
                                    {idx === 0 && <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Qtd. unidades</label>}
                                    <input type="number" min="0" inputMode="numeric" value={t.quantidade}
                                        onChange={e => updateUnitType(idx, 'quantidade', e.target.value)} placeholder="Ex: 10"
                                        className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm text-center" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    {idx === 0 && <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">m² de cada</label>}
                                    <input type="number" min="0" inputMode="decimal" value={t.area}
                                        onChange={e => updateUnitType(idx, 'area', e.target.value)} placeholder="Ex: 50"
                                        className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm text-center" />
                                </div>
                                {unitTypes.length > 1 && (
                                    <button type="button" onClick={() => removeUnitType(idx)}
                                        className="w-11 h-11 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-red-400 shrink-0">
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                )}
                            </div>
                        ))}

                        <button type="button" onClick={addUnitType}
                            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-2">
                            <i className="fa-solid fa-plus"></i> adicionar tipo de unidade (m² diferente)
                        </button>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custo por m²</label>
                            {obrasRefM2.length > 0 && (
                                <select value="" onChange={e => { const v = parseFloat(e.target.value); if (v) setCustoM2(v); }}
                                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-blue-400 text-[11px] cursor-pointer">
                                    <option value="">↧ puxar R$/m² de uma obra concluída…</option>
                                    {obrasRefM2.map(o => (
                                        <option key={o.id} value={o.valor}>
                                            {o.name} — {formatCurrency(o.valor)}/m² {o.ehReal ? '(custo real)' : '(estimado)'}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <MoneyInput value={custoM2} onChange={setCustoM2}
                                className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm" />
                        </div>

                        {hasConstrucao && (
                            <div className="bg-slate-800/60 rounded-2xl p-4 border border-emerald-500/30 space-y-1">
                                <p className="text-center text-white font-bold text-sm">
                                    {totalUnits} unidade{totalUnits > 1 ? 's' : ''} · {totalArea.toLocaleString('pt-BR')} m²
                                </p>
                                <p className="text-center text-emerald-400 font-black text-xl">{formatCurrency(totalCost)}</p>
                                <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest">Orçamento total estimado</p>
                            </div>
                        )}
                    </Section>
                    )}

                    {/* Orçamento por etapa (opcional). A régua vem do preset do BANCO —
                        a mesma que a obra vai receber — e é ajustável já na criação. */}
                    {budgetTotal > 0 && stages.length > 0 && (
                        <Section icon="fa-list-check" color="text-blue-400" title="Orçamento por etapa"
                            hint={moldeSource ? `da obra ${moldeSource}` : (pctDirty ? 'ajustado por você' : 'sugestão, ajustável')}
                            open={showEtapas} onToggle={() => setShowEtapas(v => !v)}>
                            <p className="text-[11px] text-slate-500 -mt-1">
                                Distribuição <b className="text-slate-400">sugerida</b> com base em obras residenciais econômicas.
                                Ajuste conforme seu projeto, região e método construtivo — dá pra mudar depois também, no Orçamento da obra.
                            </p>

                            {/* Aprender de uma obra concluída: puxa a régua REAL por etapa */}
                            {obrasMolde.length > 0 && (
                                <div className="space-y-1">
                                    <select value="" onChange={e => { if (e.target.value) applyMolde(e.target.value); }}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-blue-400 text-[11px] cursor-pointer">
                                        <option value="">↧ puxar a régua real de uma obra concluída…</option>
                                        {obrasMolde.map(o => (
                                            <option key={o.id} value={o.id}>{o.name} — como ela gastou de verdade</option>
                                        ))}
                                    </select>
                                    {moldeSource && (
                                        <p className="text-[10px] text-blue-400/80 font-bold ml-1">
                                            <i className="fa-solid fa-graduation-cap"></i> régua real da obra “{moldeSource}” — ajuste à vontade
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                {stages.map((s, idx) => (
                                    <div key={s.displayOrder} className="flex items-center gap-2">
                                        <span className="flex-1 min-w-0 text-xs text-slate-300 truncate">
                                            {s.name}
                                            {s.timeBased && (
                                                <span className="text-slate-600 text-[10px]" title="Custo que corre a obra inteira (canteiro, água, luz), não uma fase">
                                                    {' '}· corre a obra toda
                                                </span>
                                            )}
                                        </span>
                                        <div className="relative shrink-0">
                                            <input type="number" min="0" max="100" step="any" inputMode="decimal"
                                                value={s.percentage}
                                                onChange={e => updateStagePct(idx, e.target.value)}
                                                className="w-16 pl-2 pr-5 py-1.5 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-lg outline-none font-bold text-white text-xs text-right" />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] pointer-events-none">%</span>
                                        </div>
                                        <span className="w-24 text-right text-slate-200 font-bold text-xs shrink-0">
                                            {formatCurrency(budgetTotal * (s.percentage || 0) / 100)}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className={`flex items-center justify-between rounded-xl px-4 py-2 ${somaOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                <span className="text-[10px] font-black uppercase tracking-widest">Soma</span>
                                <span className="font-black text-sm">{soma.toFixed(1)}%{!somaOk && ' (precisa fechar 100%)'}</span>
                            </div>

                            {pctDirty && (
                                <button type="button" onClick={resetStages}
                                    className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-2">
                                    <i className="fa-solid fa-rotate-left"></i> voltar à sugestão
                                </button>
                            )}
                        </Section>
                    )}

                    {/* Situação atual (só no modo "já em andamento") */}
                    {mode === 'andamento' && (
                        <Section icon="fa-clipboard-check" color="text-blue-400" title="Situação atual"
                            open={showSituacao} onToggle={() => setShowSituacao(v => !v)}>
                            <p className="text-[11px] text-slate-500 -mt-1">Totais de hoje. Viram um aporte e um gasto de abertura; o detalhe por etapa você lança depois.</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Orçamento total</label>
                                    {hasConstrucao ? (
                                        <div className="w-full px-4 py-3 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl font-bold text-slate-300 text-sm">
                                            {formatCurrency(totalCost)}
                                            <span className="block text-[9px] text-slate-500 font-bold normal-case">das unidades</span>
                                        </div>
                                    ) : (
                                        <MoneyInput value={openBudget} onChange={setOpenBudget}
                                            className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-white text-sm" />
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Progresso (%)</label>
                                    <input type="number" min="0" max="100" inputMode="numeric" value={openProgress}
                                        onChange={e => setOpenProgress(e.target.value)} placeholder="Ex: 40"
                                        className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-white text-sm text-center" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Total aportado</label>
                                    <MoneyInput value={openAportado} onChange={setOpenAportado}
                                        className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Total gasto</label>
                                    <MoneyInput value={openGasto} onChange={setOpenGasto}
                                        className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-rose-500 rounded-xl outline-none font-bold text-white text-sm" />
                                </div>
                            </div>

                            {(openAportado > 0 || openGasto > 0) && (
                                <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700 flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Saldo em caixa</span>
                                    <span className={`font-black text-lg ${openSaldo >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(openSaldo)}</span>
                                </div>
                            )}
                        </Section>
                    )}

                    <div className="pt-1 flex gap-4">
                        <button type="submit" disabled={saving}
                            className="flex-1 py-4 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-xs tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                            {saving && <i className="fa-solid fa-spinner fa-spin"></i>}
                            {mode === 'andamento' ? 'Começar Obra' : (hasConstrucao ? 'Criar Obra + Orçamento' : 'Criar Obra')}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        modalRoot
    );
};

export default NewObraModal;
