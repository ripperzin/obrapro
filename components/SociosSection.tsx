import React, { useState } from 'react';
import { Project, User } from '../types';
import { formatCurrency, formatCurrencyAbbrev, generateId } from '../utils';
import { openAttachment } from '../utils/storage';
import { computeProjectFinance, computeUnitResult, computeAporteShares } from '../utils/projectFinance';
import { useSaveProfitShares } from '../hooks/useProfitShares';
import { useAddInvestor, useUpdateInvestor, useDeleteContribution, useDeleteInvestor } from '../hooks/useAportes';
import CashSummaryCards from './CashSummaryCards';
import AddContributionModal from './AddContributionModal';
import { usePlan } from './PlanProvider';

interface Row {
    _key: string;   // chave local estável (para o estado de edição por linha)
    investorId?: string;
    name: string;
    percentage: string;
    naoAporta?: boolean;
}

interface Props {
    project: Project;
    user: User;
    onUpdate?: (projectId: string, updates: Partial<Project>) => void;
}

interface SocioView {
    key: string;
    name: string;
    participacao: string;
    aportado: number;
    apDinheiro: number;     // parte do aportado que entrou em dinheiro (caixa)
    apDespesa: number;      // parte do aportado paga direto em despesas
    falta: number | null;   // null = não aporta / sem base
    naoAporta: boolean;
    lucro: number;
    margem: number | null;   // margem de lucro estimada (lucro ÷ venda atribuída ao sócio)
    temLucro: boolean;
    real: boolean;          // true = número já realizado (obra concluída / casa vendida)
    badge: string;          // 'vendido' | 'real' | 'estimado'
}

const inputClass = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none text-sm';

/**
 * Aba "Sócios": um card por sócio (Aportou · Falta · Lucro), com o cadastro e o
 * extrato recolhidos. Funde os antigos "Aportes por sócio", "Lucro por sócio",
 * "Divisão por unidade" e "Acerto de aportes" numa visão única por sócio.
 */
const SociosSection: React.FC<Props> = ({ project, user, onUpdate }) => {
    const { ent, openUpgrade } = usePlan();
    const f = computeProjectFinance(project);
    const isCompleted = project.progress >= 100;
    const investors = project.investors || [];
    const saved = project.profitShares || [];
    const contributions = [...(project.contributions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const [rows, setRows] = useState<Row[]>(
        saved.map((s) => ({ _key: s.id || generateId(), investorId: s.investorId, name: s.name, percentage: String(s.percentage ?? ''), naoAporta: s.naoAporta }))
    );
    const [editingKey, setEditingKey] = useState<string | null>(null);
    // Modo escolhido nesta sessão. Trava a UI no modo escolhido para o refetch
    // (disparado ao salvar sócio/aporte) NÃO reverter a escolha antes do write
    // do modo chegar no banco.
    const [modeOverride, setModeOverride] = useState<'percent' | 'unit' | null>(null);
    const splitMode: 'percent' | 'unit' = modeOverride ?? (project.splitMode === 'unit' ? 'unit' : 'percent');
    const setSplitMode = (mode: 'percent' | 'unit') => {
        if (mode === splitMode) return;
        setModeOverride(mode);
        if (onUpdate) onUpdate(project.id, { splitMode: mode });
    };
    const [saving, setSaving] = useState(false);
    const [showAporte, setShowAporte] = useState(false);
    const [showManage, setShowManage] = useState(false);
    const [showExtrato, setShowExtrato] = useState(false);
    const save = useSaveProfitShares();
    const addInvestor = useAddInvestor();
    const updateInvestor = useUpdateInvestor();
    const deleteContribution = useDeleteContribution();
    const deleteInvestor = useDeleteInvestor();

    const soma = rows.reduce((s, r) => s + (parseFloat(r.percentage) || 0), 0);
    const somaOk = Math.abs(soma - 100) < 0.01;

    // Sócios que já contam contra o plano: os cadastrados + as linhas novas
    // ainda não salvas (que viram sócio ao salvar). O "Recursos próprios",
    // criado sozinho na abertura da obra, já ocupa a vaga única do Free.
    const sociosUsados = investors.length + rows.filter((r) => !r.investorId).length;
    const sociosCheios = sociosUsados >= ent.maxSocios;

    const addManual = () => {
        if (sociosCheios) {
            openUpgrade('socios');
            return;
        }
        const key = generateId();
        setRows([...rows, { _key: key, name: '', percentage: '' }]);
        setEditingKey(key);
    };
    const addInvestorRow = (id: string) => {
        const inv = investors.find((i) => i.id === id);
        if (inv && !rows.some((r) => r.investorId === id)) {
            const key = generateId();
            setRows([...rows, { _key: key, investorId: inv.id, name: inv.name, percentage: '' }]);
            setEditingKey(key);
        }
    };
    const update = (idx: number, field: keyof Row, value: string) =>
        setRows(rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    // Remove a linha. Se o sócio já existe no projeto (tem investorId), faz o
    // hard delete (investor + aportes) e reescreve os profit_shares sem ele.
    const removeRow = async (idx: number) => {
        const r = rows[idx];
        const remaining = rows.filter((_, i) => i !== idx);
        if (!r.investorId) {
            setRows(remaining);
            return;
        }
        if (!window.confirm(`Remover o sócio "${r.name}" e todos os aportes dele? Isso apaga do projeto e não volta.`)) return;
        setEditingKey(null);
        setRows(remaining);
        try {
            await save.mutateAsync({
                projectId: project.id,
                shares: remaining.filter((x) => x.name.trim()).map((x) => ({ investorId: x.investorId, name: x.name.trim(), percentage: parseFloat(x.percentage) || 0, naoAporta: !!x.naoAporta })),
            });
            await deleteInvestor.mutateAsync(r.investorId);
        } catch (e: any) {
            alert('Erro ao remover: ' + (e.message || e));
        }
    };
    const toggleNaoAporta = (idx: number) => setRows(rows.map((r, i) => (i === idx ? { ...r, naoAporta: !r.naoAporta } : r)));

    // Salva sócios. Cada sócio vira um investidor (cria se ainda não existir),
    // para poder receber aportes e ser escolhido como pagador de despesas.
    const handleSave = async () => {
        try {
            setSaving(true);
            const resolved: { investorId: string; name: string; percentage: number; naoAporta: boolean }[] = [];
            for (const r of rows) {
                const name = r.name.trim();
                if (!name) continue;
                let investorId = r.investorId;
                if (!investorId) {
                    const match = investors.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
                    if (match) {
                        investorId = match.id;
                    } else {
                        const inv = await addInvestor.mutateAsync({ projectId: project.id, name });
                        investorId = inv.id;
                    }
                } else {
                    // Renomear: se o nome mudou, atualiza o investor de verdade (não só a participação)
                    const existing = investors.find((i) => i.id === investorId);
                    if (existing && existing.name.trim() !== name) {
                        await updateInvestor.mutateAsync({ id: investorId, name });
                    }
                }
                resolved.push({ investorId, name, percentage: parseFloat(r.percentage) || 0, naoAporta: !!r.naoAporta });
            }
            await save.mutateAsync({
                projectId: project.id,
                shares: resolved.map((r) => ({ investorId: r.investorId, name: r.name, percentage: r.percentage, naoAporta: r.naoAporta })),
            });
            setRows(resolved.map((r) => ({ _key: generateId(), investorId: r.investorId, name: r.name, percentage: String(r.percentage), naoAporta: r.naoAporta })));
        } catch (e: any) {
            alert('Erro ao salvar: ' + (e.message || e));
        } finally {
            setSaving(false);
        }
    };

    // Confirma (trava) a linha em edição: valida o nome, persiste tudo e fecha.
    const confirmRow = async (idx: number) => {
        if (!rows[idx]?.name.trim()) { alert('Dê um nome ao sócio.'); return; }
        await handleSave();
        setEditingKey(null);
    };

    const investorsDisponiveis = investors.filter((i) => !rows.some((r) => r.investorId === i.id));

    const aportadoDinheiro = (id: string) => (project.contributions || []).filter((c) => c.investorId === id).reduce((s, c) => s + (c.value || 0), 0);
    const aportadoViaDespesa = (id: string) => (project.expenses || []).filter((e) => e.paidByInvestorId === id).reduce((s, e) => s + (e.value || 0), 0);
    const aportadoTotal = (id?: string) => (id ? aportadoDinheiro(id) + aportadoViaDespesa(id) : 0);
    const investorName = (id: string) => investors.find((i) => i.id === id)?.name || 'Sócio';
    const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '');

    // ---- Acerto de aportes (meta/falta por sócio) + montagem da visão única ----
    const acerto = computeAporteShares(project);
    const acertoDe = (investorId?: string) => acerto.shares.find((x) => x.investorId === investorId);
    const faltaTone = (v: number) => (v > 0.5 ? 'text-amber-400' : v < -0.5 ? 'text-emerald-400' : 'text-slate-500');
    const faltaLabel = (v: number) => (v > 0.5 ? `~${formatCurrency(v)}` : v < -0.5 ? `+${formatCurrency(-v)}` : 'Em dia');

    const units = project.units || [];
    let sociosView: SocioView[] = [];
    if (splitMode === 'unit') {
        const donos = investors.filter((inv) => units.some((u) => u.ownerInvestorId === inv.id));
        sociosView = donos.map((inv) => {
            const suas = units.filter((u) => u.ownerInvestorId === inv.id);
            const lucro = suas.reduce((s, u) => s + computeUnitResult(project, u).resultado, 0);
            const vendaSocio = suas.reduce((s, u) => s + computeUnitResult(project, u).venda, 0);
            const margem = vendaSocio > 0 ? (lucro / vendaSocio) * 100 : null;
            const vendido = suas.length > 0 && suas.every((u) => u.status === 'Sold');
            const acc = acertoDe(inv.id);
            const real = vendido && isCompleted;
            return {
                key: inv.id,
                name: inv.name,
                participacao: suas.map((u) => u.identifier).join(', '),
                aportado: aportadoTotal(inv.id),
                apDinheiro: aportadoDinheiro(inv.id),
                apDespesa: aportadoViaDespesa(inv.id),
                falta: acc ? acc.falta : null,
                naoAporta: false,
                lucro,
                margem,
                temLucro: true,
                real,
                badge: real ? 'vendido' : 'estimado',
            };
        });
    } else {
        sociosView = saved.map((s) => {
            const pct = (s.percentage || 0) / 100;
            const lucro = isCompleted ? f.lucroReal * pct : f.lucroProjetado * pct;
            const margem = isCompleted ? f.margemRealPct : f.margemPct;
            const acc = acertoDe(s.investorId);
            return {
                key: s.id,
                name: s.name,
                participacao: `${s.percentage || 0}%`,
                aportado: aportadoTotal(s.investorId),
                apDinheiro: s.investorId ? aportadoDinheiro(s.investorId) : 0,
                apDespesa: s.investorId ? aportadoViaDespesa(s.investorId) : 0,
                falta: s.naoAporta ? null : acc ? acc.falta : null,
                naoAporta: !!s.naoAporta,
                lucro,
                margem,
                temLucro: f.vendasEstimadasTotais > 0,
                real: isCompleted,
                badge: isCompleted ? 'real' : 'estimado',
            };
        });
    }
    const semDono = splitMode === 'unit' ? units.filter((u) => !u.ownerInvestorId) : [];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Cabeçalho + seletor de modo */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-black text-white text-xl uppercase tracking-tight flex items-center gap-3">
                    <i className="fa-solid fa-users-gear text-blue-400"></i>
                    Sócios
                </h3>
                <div className="flex bg-slate-800 rounded-xl p-1 shrink-0">
                    <button
                        onClick={() => setSplitMode('percent')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${splitMode === 'percent' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        Por %
                    </button>
                    <button
                        onClick={() => setSplitMode('unit')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition ${splitMode === 'unit' ? 'bg-fuchsia-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        Por casa
                    </button>
                </div>
            </div>

            {/* Caixa da obra */}
            <CashSummaryCards project={project} />

            {/* ▸ Gerenciar sócios (cadastro + % + pagador padrão) */}
            <div className="glass rounded-2xl border border-slate-700 overflow-hidden">
                <button
                    onClick={() => setShowManage((v) => !v)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/40 transition"
                >
                    <span className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                        <i className="fa-solid fa-user-gear text-blue-400"></i> Gerenciar sócios
                    </span>
                    <i className={`fa-solid fa-chevron-down text-slate-500 text-xs transition-transform ${showManage ? 'rotate-180' : ''}`}></i>
                </button>

                {showManage && (
                    <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-700/60">
                        <p className="text-[11px] text-slate-500 leading-snug">
                            {splitMode === 'percent'
                                ? 'Quem divide o lucro e quanto. Marque "não aporta" para quem entra só no lucro (ex.: administrador).'
                                : 'Cadastre os sócios. A divisão é por casa — defina o dono de cada unidade na aba Unidades.'}
                            {' '}Toque no <i className="fa-solid fa-pen text-slate-600"></i> para editar/renomear e <b>Confirmar</b>; a <i className="fa-solid fa-trash text-slate-600"></i> (ao editar) exclui o sócio do projeto.
                        </p>

                        <div className="space-y-2">
                            {rows.length === 0 && <p className="text-slate-500 text-sm">Nenhum sócio ainda. Toque em "Adicionar sócio".</p>}
                            {rows.map((r, idx) => {
                                const editing = editingKey === r._key;
                                if (!editing) {
                                    return (
                                        <div key={r._key} className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3">
                                            <div className="min-w-0">
                                                <p className="text-white font-bold truncate">{r.name || <span className="text-slate-500 italic">Sem nome</span>}</p>
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">
                                                    {splitMode === 'percent'
                                                        ? <>{r.percentage || 0}%{r.naoAporta && <span className="text-amber-400/80"> · não aporta</span>}</>
                                                        : 'sócio'}
                                                </p>
                                            </div>
                                            <button onClick={() => setEditingKey(r._key)} className="text-slate-400 hover:text-blue-400 transition shrink-0 w-8" title="Editar">
                                                <i className="fa-solid fa-pen"></i>
                                            </button>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={r._key} className="bg-slate-800/60 rounded-xl border border-blue-500/40 p-3 space-y-2">
                                        <input
                                            value={r.name}
                                            onChange={(e) => update(idx, 'name', e.target.value)}
                                            placeholder="Nome do sócio"
                                            autoFocus
                                            className={`${inputClass} w-full`}
                                        />
                                        {splitMode === 'percent' && (
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-24 shrink-0">
                                                    <input
                                                        type="number" min="0" max="100" inputMode="decimal"
                                                        value={r.percentage}
                                                        onChange={(e) => update(idx, 'percentage', e.target.value)}
                                                        placeholder="0"
                                                        className={`${inputClass} w-full text-center pr-6`}
                                                    />
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                                                </div>
                                                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 cursor-pointer select-none" title="Participa do lucro mas NÃO aporta (ex.: administrador).">
                                                    <input type="checkbox" checked={!!r.naoAporta} onChange={() => toggleNaoAporta(idx)} className="w-4 h-4 accent-amber-500" />
                                                    não aporta
                                                </label>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                onClick={() => confirmRow(idx)}
                                                disabled={saving}
                                                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-2 rounded-lg transition flex items-center justify-center gap-2 text-sm"
                                            >
                                                {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                                                {saving ? 'Salvando…' : 'Confirmar'}
                                            </button>
                                            <button
                                                onClick={() => removeRow(idx)}
                                                title={r.investorId ? 'Excluir sócio do projeto (e aportes dele)' : 'Descartar'}
                                                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-rose-400 transition"
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {splitMode === 'percent' && rows.length > 0 && (
                            <div className={`flex items-center justify-between rounded-xl px-4 py-2 ${somaOk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                <span className="text-xs font-black uppercase tracking-widest">Soma</span>
                                <span className="font-black">{soma.toFixed(1)}%{!somaOk && ' (precisa fechar 100%)'}</span>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {investorsDisponiveis.length > 0 && (
                                <select
                                    value=""
                                    onChange={(e) => { if (e.target.value) addInvestorRow(e.target.value); }}
                                    className={`${inputClass} flex-1 min-w-0`}
                                >
                                    <option value="">+ Sócio existente…</option>
                                    {investorsDisponiveis.map((i) => (
                                        <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                </select>
                            )}
                            <button type="button" onClick={addManual} className="flex-1 min-w-0 px-3 py-2.5 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-300 hover:bg-blue-600/30 text-sm font-black">
                                <i className={`fa-solid ${sociosCheios ? 'fa-lock text-amber-400' : 'fa-plus'} mr-1`}></i> Adicionar sócio
                            </button>
                        </div>

                        {/* Pagador padrão */}
                        {investors.length > 0 && onUpdate && (
                            <div className="pt-4 border-t border-slate-700/60">
                                <p className="text-white font-black text-[11px] uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <i className="fa-solid fa-hand-holding-dollar text-amber-400"></i> Pagador padrão
                                </p>
                                <p className="text-[11px] text-slate-500 mb-3 leading-snug">
                                    Se um sócio banca a obra do próprio bolso, toda <b>nova despesa</b> já nasce marcada como paga por ele (vira aporte dele). Pode mudar em cada despesa.
                                </p>
                                <select
                                    value={project.financedByInvestorId || ''}
                                    onChange={(e) => onUpdate(project.id, { financedByInvestorId: e.target.value || undefined })}
                                    className={`${inputClass} w-full`}
                                >
                                    <option value="">Caixa da obra (padrão)</option>
                                    {investors.map((i) => (
                                        <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Cards por sócio: Aportou · Falta · Lucro */}
            <div className="glass rounded-2xl border border-slate-700 p-5">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-[11px] text-slate-500 font-bold">
                        {splitMode === 'unit' ? 'Divisão por casa' : 'Divisão por porcentagem'}
                    </p>
                    <button
                        onClick={() => setShowAporte(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-3 py-2 rounded-xl flex items-center gap-2 transition text-xs"
                    >
                        <i className="fa-solid fa-plus"></i> Registrar aporte
                    </button>
                </div>

                {sociosView.length === 0 ? (
                    <div className="text-center py-8">
                        <i className="fa-solid fa-user-plus text-slate-600 text-2xl mb-2"></i>
                        <p className="text-slate-400 text-sm font-bold">Nenhum sócio ainda.</p>
                        <p className="text-slate-600 text-[11px] mt-1">
                            {splitMode === 'unit' ? 'Defina o dono de cada casa na aba Unidades.' : 'Cadastre em "Gerenciar sócios" abaixo.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sociosView.map((s) => (
                            <div key={s.key} className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-4">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                    <div className="min-w-0">
                                        <p className="text-white font-black truncate">{s.name}</p>
                                        <p className="text-[11px] text-slate-500 font-bold truncate">
                                            {splitMode === 'unit'
                                                ? <><i className="fa-solid fa-house mr-1 text-fuchsia-400"></i>{s.participacao}</>
                                                : <>{s.participacao}{s.naoAporta && <span className="text-amber-400/80"> · não aporta</span>}</>}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowAporte(true)}
                                        className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 shrink-0"
                                    >
                                        <i className="fa-solid fa-plus mr-1"></i>Aporte
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Aportou</p>
                                        <p className="text-sm font-black text-emerald-400">{formatCurrency(s.aportado)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Falta</p>
                                        <p className={`text-sm font-black ${s.naoAporta || s.falta === null ? 'text-slate-500' : faltaTone(s.falta)}`}>
                                            {s.naoAporta ? '—' : s.falta === null ? '—' : faltaLabel(s.falta)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">
                                            Lucro <span className={s.real ? 'text-emerald-400' : 'text-cyan-400'}>· {s.badge}</span>
                                        </p>
                                        <p className={`text-sm font-black ${!s.temLucro ? 'text-slate-500' : s.lucro < 0 ? 'text-rose-400' : s.real ? 'text-emerald-400' : 'text-cyan-400'}`}>
                                            {s.temLucro ? formatCurrency(s.lucro) : '—'}
                                        </p>
                                        {s.temLucro && s.margem !== null && (
                                            <p className="text-[8px] font-bold text-slate-500 mt-0.5">margem {s.margem.toFixed(1)}%</p>
                                        )}
                                    </div>
                                </div>
                                {s.apDespesa > 0 && (
                                    <p className="text-[9px] text-slate-500 font-bold text-center mt-2 leading-snug">
                                        {formatCurrencyAbbrev(s.apDinheiro)} em dinheiro · {formatCurrencyAbbrev(s.apDespesa)} pago em despesa
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {acerto.totalFalta > 0.5 && (
                    <p className="text-[11px] text-amber-400 font-bold mt-4 text-center">
                        <i className="fa-solid fa-circle-arrow-up mr-1"></i>
                        Falta aportar no total (estimado): ~{formatCurrency(acerto.totalFalta)}
                    </p>
                )}
                {semDono.length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-3 leading-snug text-center">
                        <i className="fa-solid fa-circle-info mr-1"></i>
                        {semDono.length} casa{semDono.length > 1 ? 's' : ''} sem dono. Defina na aba <b>Unidades</b>.
                    </p>
                )}
                <p className="text-[10px] text-slate-500 mt-3 leading-snug text-center">
                    {splitMode === 'unit'
                        ? 'Lucro e aporte saem do custo da casa de cada sócio (obra + terreno rateado por área).'
                        : 'Lucro e aporte saem da % de cada sócio. Quem "não aporta" (ex.: admin) só entra no lucro.'}
                    {' '}A coluna <b>Falta</b> é uma estimativa: a parte de cada sócio no <b>custo previsto</b> da obra menos o que já aportou.
                    {!isCompleted && ' Números estimados até a obra concluir.'}
                </p>
            </div>

            {/* ▸ Extrato de aportes (lançamentos em caixa) */}
            {contributions.length > 0 && (
                <div className="glass rounded-2xl border border-slate-700 overflow-hidden">
                    <button
                        onClick={() => setShowExtrato((v) => !v)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/40 transition"
                    >
                        <span className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                            <i className="fa-solid fa-receipt text-emerald-400"></i> Extrato de aportes ({contributions.length})
                        </span>
                        <i className={`fa-solid fa-chevron-down text-slate-500 text-xs transition-transform ${showExtrato ? 'rotate-180' : ''}`}></i>
                    </button>

                    {showExtrato && (
                        <div className="px-5 pb-5 pt-1 border-t border-slate-700/60">
                            <div className="space-y-2">
                                {contributions.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-2.5">
                                        <div className="min-w-0">
                                            <p className="text-white font-bold text-sm truncate">{investorName(c.investorId)}</p>
                                            <p className="text-slate-500 text-xs truncate">
                                                {fmtDate(c.date)}{c.description ? ` · ${c.description}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {c.attachments && c.attachments.length > 0 && (
                                                <button
                                                    onClick={() => openAttachment(c.attachments![0])}
                                                    className="text-blue-400 hover:text-blue-300 transition"
                                                    title="Ver comprovante"
                                                >
                                                    <i className="fa-solid fa-paperclip"></i>
                                                </button>
                                            )}
                                            <span className="text-emerald-400 font-black text-sm">{formatCurrency(c.value)}</span>
                                            <button
                                                onClick={() => { if (window.confirm('Excluir este aporte?')) deleteContribution.mutate(c.id); }}
                                                className="text-slate-500 hover:text-rose-400 transition"
                                                title="Excluir aporte"
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showAporte && (
                <AddContributionModal project={project} user={user} onClose={() => setShowAporte(false)} />
            )}
        </div>
    );
};

export default SociosSection;
