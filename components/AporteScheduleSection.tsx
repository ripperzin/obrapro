import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Project, AportePlan, AporteParcela } from '../types';
import { formatCurrency, formatCurrencyAbbrev, generateId } from '../utils';
import { generateAporteSchedule } from '../utils/aportePlan';
import { useAddContribution, useDeleteContribution } from '../hooks/useAportes';

// Uma coluna da matriz = um sócio que aporta.
export interface SocioCol {
    investorId: string;
    name: string;
    cota: string;        // "40%" ou "Casa 01"
    aportado: number;    // já aportou (dinheiro + despesa)
    meta: number;        // quanto deve no total
    lucro: number;
    temLucro: boolean;
    badge: string;       // 'real' | 'estimado' | 'vendido'
}

interface Props {
    project: Project;
    socios: SocioCol[];
    onUpdate?: (projectId: string, updates: Partial<Project>) => void;
    onRegisterAporte?: () => void;
}

const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none';

// Card "Sócios": a matriz Data × Sócios serve de plano E de registro. Cada célula
// tem valor + botão "pago" (ao marcar, cria o aporte real → caixa/extrato). Aportes
// avulsos (fora do plano) aparecem como linhas verdes. Mesma tabela no app e no link.
const AporteScheduleSection: React.FC<Props> = ({ project, socios, onUpdate, onRegisterAporte }) => {
    const addContribution = useAddContribution();
    const deleteContribution = useDeleteContribution();

    const [plan, setPlan] = useState<AportePlan>(project.aportePlan || { parcelas: [] });
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (!dirtyRef.current) setPlan(project.aportePlan || { parcelas: [] }); }, [project.aportePlan]);

    const [nParcelas, setNParcelas] = useState(10);
    const [intervalo, setIntervalo] = useState(21);
    const [inicio, setInicio] = useState(project.startDate || new Date().toISOString().slice(0, 10));

    const parcelas = plan.parcelas || [];
    const setParcelas = (ps: AporteParcela[]) => { setPlan({ parcelas: ps }); dirtyRef.current = true; setDirty(true); };

    // Aportes REAIS que não estão ligados a nenhuma parcela = avulsos (fora do plano).
    const avulsoRows = useMemo(() => {
        const linked = new Set<string>();
        parcelas.forEach((p) => Object.values(p.paidContrib || {}).forEach((id) => id && linked.add(id)));
        const byDate = new Map<string, { [id: string]: { value: number; contribIds: string[] } }>();
        (project.contributions || []).forEach((c: any) => {
            if (!c.id || !c.investorId || linked.has(c.id)) return;
            const d = (c.date || '').slice(0, 10) || '—';
            if (!byDate.has(d)) byDate.set(d, {});
            const m = byDate.get(d)!;
            if (!m[c.investorId]) m[c.investorId] = { value: 0, contribIds: [] };
            m[c.investorId].value += c.value || 0;
            m[c.investorId].contribIds.push(c.id);
        });
        return [...byDate.entries()].map(([date, vals]) => ({ date, vals }));
    }, [project.contributions, parcelas]);

    // Linhas da matriz: parcelas do plano + avulsos, ordenadas por data.
    const rows = useMemo(() => {
        const planRows = parcelas.map((p) => ({ kind: 'plan' as const, key: p.id, date: p.date, parcela: p }));
        const avRows = avulsoRows.map((a, i) => ({ kind: 'avulso' as const, key: `av-${a.date}-${i}`, date: a.date, vals: a.vals }));
        return [...planRows, ...avRows].sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    }, [parcelas, avulsoRows]);

    const sugerir = (mode: 'iguais' | 'ritmo') => {
        const cols = socios.map((s) => ({ investorId: s.investorId, name: s.name, meta: s.meta, aportado: s.aportado, falta: s.meta - s.aportado }));
        const p = generateAporteSchedule(cols, project, { mode, nParcelas, startDate: inicio, intervalDays: intervalo });
        if (!p) { alert('Gere o cronograma da obra primeiro (aba Orçamento → "Gerar cronograma") para distribuir os aportes pelo ritmo.'); return; }
        setParcelas(p.parcelas);
        setOpen(true);
    };
    const addParcela = () => {
        const last = parcelas[parcelas.length - 1];
        const base = last ? new Date(last.date + 'T00:00:00').getTime() + intervalo * 86400000 : new Date(inicio + 'T00:00:00').getTime();
        setParcelas([...parcelas, { id: generateId(), date: new Date(base).toISOString().slice(0, 10), values: {} }]);
        setOpen(true);
    };
    const removeParcela = (id: string) => setParcelas(parcelas.filter((p) => p.id !== id));
    const setDate = (id: string, date: string) => setParcelas(parcelas.map((p) => p.id === id ? { ...p, date } : p));
    const setValue = (id: string, sid: string, v: number) => setParcelas(parcelas.map((p) => p.id === id ? { ...p, values: { ...p.values, [sid]: v } } : p));
    const salvar = () => { onUpdate?.(project.id, { aportePlan: plan }); dirtyRef.current = false; setDirty(false); };

    // Marca/desmarca uma célula como PAGA: cria/apaga o aporte real e liga na parcela.
    const togglePago = async (parcela: AporteParcela, sid: string) => {
        if (dirty) { alert('Salve o cronograma antes de dar baixa nos aportes.'); return; }
        if (busy) return;
        const contribId = parcela.paidContrib?.[sid];
        setBusy(true);
        try {
            if (contribId) {
                await deleteContribution.mutateAsync(contribId);
                const np = { ...(parcela.paidContrib || {}) }; delete np[sid];
                const next = parcelas.map((p) => p.id === parcela.id ? { ...p, paidContrib: np } : p);
                setPlan({ parcelas: next });   // sincroniza local (evita corrida entre cliques)
                onUpdate?.(project.id, { aportePlan: { parcelas: next } });
            } else {
                const value = parcela.values?.[sid] || 0;
                if (value <= 0) { setBusy(false); return; }
                const c: any = await addContribution.mutateAsync({ projectId: project.id, investorId: sid, value, date: parcela.date, description: 'Aporte do cronograma' });
                const next = parcelas.map((p) => p.id === parcela.id ? { ...p, paidContrib: { ...(p.paidContrib || {}), [sid]: c.id } } : p);
                setPlan({ parcelas: next });   // sincroniza local (evita corrida entre cliques)
                onUpdate?.(project.id, { aportePlan: { parcelas: next } });
            }
        } catch (e: any) {
            alert('Erro ao atualizar o aporte: ' + (e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    const removeAvulso = async (contribIds: string[]) => {
        if (busy || !window.confirm('Apagar este aporte?')) return;
        setBusy(true);
        try { for (const id of contribIds) await deleteContribution.mutateAsync(id); }
        catch (e: any) { alert('Erro ao apagar: ' + (e?.message || e)); }
        finally { setBusy(false); }
    };

    const totalAportado = socios.reduce((s, x) => s + x.aportado, 0);
    const totalMeta = socios.reduce((s, x) => s + x.meta, 0);
    const totalPorSocio = (sid: string) => parcelas.reduce((s, p) => s + (p.values?.[sid] || 0), 0);

    if (socios.length === 0) {
        return (
            <div className="glass rounded-2xl border border-slate-700 p-5">
                <h3 className="font-black text-white flex items-center gap-2"><i className="fa-solid fa-users text-blue-400"></i> Sócios</h3>
                <p className="text-slate-400 text-sm mt-2">Cadastre os sócios (e as cotas, ou as casas de cada um) em <b>Configurar sócios</b> para montar a divisão e o cronograma de aportes.</p>
            </div>
        );
    }

    return (
        <div className="glass rounded-2xl border border-slate-700 overflow-hidden">
            <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-5 text-left">
                <h3 className="font-black text-white flex items-center gap-2">
                    <i className="fa-solid fa-users text-blue-400"></i> Sócios
                    <span className="text-xs font-bold text-slate-400">· aportado {formatCurrencyAbbrev(totalAportado)} de {formatCurrencyAbbrev(totalMeta)}</span>
                </h3>
                <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-slate-500`}></i>
            </button>

            {open && (
                <div className="px-4 sm:px-5 pb-5 space-y-4">
                    {/* Sugestão / ações */}
                    <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-3 flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black uppercase text-slate-500">Parcelas</label>
                            <input type="number" min={1} value={nParcelas} onChange={(e) => setNParcelas(Math.max(1, parseInt(e.target.value) || 1))} className={`${inputCls} w-16`} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black uppercase text-slate-500">A cada</label>
                            <select value={intervalo} onChange={(e) => setIntervalo(parseInt(e.target.value))} className={inputCls}>
                                <option value={7}>1 semana</option>
                                <option value={14}>2 semanas</option>
                                <option value={21}>3 semanas</option>
                                <option value={30}>1 mês</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-black uppercase text-slate-500">A partir de</label>
                            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputCls} />
                        </div>
                        <button onClick={() => sugerir('iguais')} className="px-3 py-2 bg-blue-600/20 border border-blue-500/40 rounded-lg text-blue-300 hover:bg-blue-600/30 text-sm font-black"><i className="fa-solid fa-wand-magic-sparkles mr-1"></i> Iguais</button>
                        <button onClick={() => sugerir('ritmo')} className="px-3 py-2 bg-purple-600/20 border border-purple-500/40 rounded-lg text-purple-300 hover:bg-purple-600/30 text-sm font-black"><i className="fa-solid fa-chart-line mr-1"></i> Pelo ritmo</button>
                        {onRegisterAporte && <button onClick={onRegisterAporte} className="px-3 py-2 bg-emerald-600/20 border border-emerald-500/40 rounded-lg text-emerald-300 hover:bg-emerald-600/30 text-sm font-black"><i className="fa-solid fa-plus mr-1"></i> Aporte avulso</button>}
                    </div>

                    {/* A MATRIZ */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse min-w-[420px]">
                            <thead>
                                <tr className="text-[10px] font-black uppercase text-slate-500">
                                    <th className="text-left px-2 py-2">Data</th>
                                    {socios.map((s) => (
                                        <th key={s.investorId} className="text-right px-2 py-2 whitespace-nowrap">
                                            <span className="text-white">{s.name}</span> <span className="text-slate-500">{s.cota}</span>
                                        </th>
                                    ))}
                                    <th className="px-2 py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 && (
                                    <tr><td colSpan={socios.length + 2} className="px-2 py-6 text-center text-slate-500 text-sm">Nenhum aporte ainda. Use <b>Iguais</b>/<b>Pelo ritmo</b> pra planejar, ou <b>Aporte avulso</b> pra lançar um direto.</td></tr>
                                )}
                                {rows.map((row) => (
                                    <tr key={row.key} className="border-t border-slate-800">
                                        <td className="px-2 py-1.5 whitespace-nowrap">
                                            {row.kind === 'plan' ? (
                                                <input type="date" value={row.parcela!.date} onChange={(e) => setDate(row.parcela!.id, e.target.value)} className={`${inputCls} w-32`} />
                                            ) : (
                                                <span className="text-slate-400 text-xs">{row.date !== '—' ? new Date(row.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data'} <span className="text-emerald-500/70">· avulso</span></span>
                                            )}
                                        </td>
                                        {socios.map((s) => {
                                            if (row.kind === 'plan') {
                                                const p = row.parcela!;
                                                const paid = !!p.paidContrib?.[s.investorId];
                                                const val = p.values?.[s.investorId] ?? 0;
                                                return (
                                                    <td key={s.investorId} className="px-2 py-1.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {dirty ? (
                                                                <input type="number" min={0} value={val || ''} placeholder="0" onChange={(e) => setValue(p.id, s.investorId, parseFloat(e.target.value) || 0)} className={`${inputCls} w-24 text-right`} />
                                                            ) : (
                                                                <span className={paid ? 'text-emerald-400 font-bold' : 'text-slate-300'}>{val > 0 ? formatCurrencyAbbrev(val) : '—'}</span>
                                                            )}
                                                            {!dirty && val > 0 && (
                                                                <button onClick={() => togglePago(p, s.investorId)} disabled={busy} title={paid ? 'Pago (clique pra desfazer)' : 'Dar como pago'}
                                                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${paid ? 'bg-emerald-500 text-white' : 'border border-slate-600 text-slate-500 hover:border-emerald-400 hover:text-emerald-400'}`}>
                                                                    <i className={`fa-solid ${paid ? 'fa-check' : 'fa-clock'}`}></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            const cell = (row.vals as any)[s.investorId];
                                            return (
                                                <td key={s.investorId} className="px-2 py-1.5 text-right">
                                                    {cell ? <span className="text-emerald-400 font-bold">{formatCurrencyAbbrev(cell.value)} <i className="fa-solid fa-check text-[10px]"></i></span> : <span className="text-slate-600">—</span>}
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-1.5 text-center">
                                            {row.kind === 'plan'
                                                ? <button onClick={() => removeParcela(row.parcela!.id)} className="text-slate-500 hover:text-rose-400" title="Remover parcela"><i className="fa-solid fa-trash text-xs"></i></button>
                                                : <button onClick={() => removeAvulso(Object.values(row.vals as any).flatMap((v: any) => v.contribIds))} className="text-slate-500 hover:text-rose-400" title="Apagar aporte"><i className="fa-solid fa-trash text-xs"></i></button>}
                                        </td>
                                    </tr>
                                ))}
                                {/* Rodapé: aportou/meta + lucro por sócio */}
                                <tr className="border-t-2 border-slate-700">
                                    <td className="px-2 py-2 text-[10px] uppercase text-slate-400 font-black">Aportou / meta</td>
                                    {socios.map((s) => {
                                        const falta = s.meta - s.aportado;
                                        return (
                                            <td key={s.investorId} className="px-2 py-2 text-right whitespace-nowrap">
                                                <span className="text-emerald-400 font-black">{formatCurrencyAbbrev(s.aportado)}</span>
                                                <span className="text-slate-500 text-xs"> / {formatCurrencyAbbrev(s.meta)}</span>
                                                {falta > 1 && <div className="text-[9px] text-amber-400 font-bold">falta {formatCurrencyAbbrev(falta)}</div>}
                                            </td>
                                        );
                                    })}
                                    <td></td>
                                </tr>
                                <tr className="text-[11px]">
                                    <td className="px-2 py-1 text-[10px] uppercase text-slate-500 font-black">Lucro</td>
                                    {socios.map((s) => (
                                        <td key={s.investorId} className="px-2 py-1 text-right whitespace-nowrap">
                                            {s.temLucro ? <span className={`${s.lucro < 0 ? 'text-rose-400' : 'text-cyan-400'} font-bold`}>{formatCurrencyAbbrev(s.lucro)} <span className="text-[8px] text-slate-500">· {s.badge}</span></span> : <span className="text-slate-600">—</span>}
                                        </td>
                                    ))}
                                    <td></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-wrap items-center gap-2">
                        {parcelas.length > 0 && <button onClick={addParcela} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white text-sm font-black"><i className="fa-solid fa-plus mr-1"></i> Parcela</button>}
                        <div className="flex-1"></div>
                        {dirty && <button onClick={salvar} className="px-5 py-2 bg-green-600 text-white rounded-lg font-black text-sm hover:bg-green-700 shadow-lg shadow-green-600/30"><i className="fa-solid fa-check mr-1"></i> Salvar</button>}
                    </div>
                    {dirty && <p className="text-[11px] text-amber-400 font-bold text-right">Salve para poder dar baixa nos aportes.</p>}
                    {!dirty && parcelas.length > 0 && <p className="text-[10px] text-slate-500 leading-snug">Clique no ✓ de cada valor para dar como <b>pago</b> — isso registra o aporte de verdade (entra no caixa e no extrato). Aportes fora do plano aparecem como linhas <span className="text-emerald-500">avulso</span>.</p>}
                </div>
            )}
        </div>
    );
};

export default AporteScheduleSection;
