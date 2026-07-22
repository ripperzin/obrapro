import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Project, AportePlan, AporteParcela } from '../types';
import { formatCurrency, formatCurrencyAbbrev, generateId } from '../utils';
import { generateAporteSchedule } from '../utils/aportePlan';
import { openAttachment } from '../utils/storage';
import { useAddContribution, useDeleteContribution } from '../hooks/useAportes';
import AttachmentUpload from './AttachmentUpload';

// Uma coluna da matriz = um sócio que aporta.
export interface SocioCol {
    investorId: string;
    name: string;
    cota: string;        // "40%" ou "Casa 01"
    aportado: number;    // já aportou (dinheiro + despesa)
    meta: number;        // quanto deve no total
}

interface Props {
    project: Project;
    socios: SocioCol[];
    onUpdate?: (projectId: string, updates: Partial<Project>) => void;
    onRegisterAporte?: () => void;
    /** Bloco "Configurar sócios" (cadastro/cotas) — mora DENTRO deste card, no topo. */
    configSlot?: React.ReactNode;
}

// Célula em confirmação: o sócio quase nunca paga exatamente o planejado nem no dia
// exato, então o valor e a data abrem editáveis antes de virar aporte de verdade.
interface ConfirmCell {
    parcelaId: string;
    investorId: string;
    socioName: string;
    value: string;
    date: string;
    planned: number;
    attachment?: string;   // comprovante do aporte (opcional)
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const labelMes = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${MESES[(parseInt(m) || 1) - 1]}/${(y || '').slice(2)}`;
};

const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none';

// Card "Sócios": a matriz Data × Sócios serve de plano E de registro. Cada célula
// tem valor + botão "pago" (ao marcar, cria o aporte real → caixa/extrato). Aportes
// avulsos (fora do plano) aparecem como linhas verdes. Mesma tabela no app e no link.
const AporteScheduleSection: React.FC<Props> = ({ project, socios, onUpdate, onRegisterAporte, configSlot }) => {
    const addContribution = useAddContribution();
    const deleteContribution = useDeleteContribution();

    const [plan, setPlan] = useState<AportePlan>(project.aportePlan || { parcelas: [] });
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    // Nasce ABERTO: com o extrato fora, este card é o conteúdo da aba Sócios.
    const [open, setOpen] = useState(true);
    const [busy, setBusy] = useState(false);
    const [confirmCell, setConfirmCell] = useState<ConfirmCell | null>(null);

    useEffect(() => { if (!dirtyRef.current) setPlan(project.aportePlan || { parcelas: [] }); }, [project.aportePlan]);

    const [nParcelas, setNParcelas] = useState(10);
    const [intervalo, setIntervalo] = useState(21);
    const [inicio, setInicio] = useState(project.startDate || new Date().toISOString().slice(0, 10));

    const parcelas = plan.parcelas || [];
    const setParcelas = (ps: AporteParcela[]) => { setPlan({ parcelas: ps }); dirtyRef.current = true; setDirty(true); };

    // Barra de MONTAR o plano: só abre sozinha quando ainda não há plano nenhum
    // (é o único caminho pra frente). Com plano feito, fica fora do caminho.
    const [planejarAberto, setPlanejarAberto] = useState<boolean | null>(null);
    const showPlanejar = planejarAberto ?? parcelas.length === 0;
    const setShowPlanejar = (f: (v: boolean) => boolean) => setPlanejarAberto(f(showPlanejar));

    // Uma célula de aporte já realizado (avulso ou despesa do bolso).
    interface CellReal { value: number; contribIds: string[]; anexos: string[]; notas: string[] }

    // Aportes REAIS que não estão ligados a nenhuma parcela = avulsos (fora do plano).
    const avulsoRows = useMemo(() => {
        const linked = new Set<string>();
        parcelas.forEach((p) => Object.values(p.paidContrib || {}).forEach((id) => id && linked.add(id)));
        const byDate = new Map<string, { [id: string]: CellReal }>();
        (project.contributions || []).forEach((c: any) => {
            if (!c.id || !c.investorId || linked.has(c.id)) return;
            const d = (c.date || '').slice(0, 10) || '—';
            if (!byDate.has(d)) byDate.set(d, {});
            const m = byDate.get(d)!;
            if (!m[c.investorId]) m[c.investorId] = { value: 0, contribIds: [], anexos: [], notas: [] };
            m[c.investorId].value += c.value || 0;
            m[c.investorId].contribIds.push(c.id);
            (c.attachments || []).forEach((a: string) => a && m[c.investorId].anexos.push(a));
            if (c.description) m[c.investorId].notas.push(c.description);
        });
        return [...byDate.entries()].map(([date, vals]) => ({ date, vals }));
    }, [project.contributions, parcelas]);

    // Despesa que o sócio pagou do próprio bolso TAMBÉM é aporte (já entra no
    // "aportou/meta"). Agrupada por MÊS para não afogar a tabela — há obra com 151.
    const despesaRows = useMemo(() => {
        const byMes = new Map<string, { vals: { [id: string]: CellReal }; qtd: number }>();
        (project.expenses || []).forEach((e: any) => {
            const sid = e.paidByInvestorId;
            if (!sid) return;
            const ym = (e.date || '').slice(0, 7);
            if (!ym) return;
            if (!byMes.has(ym)) byMes.set(ym, { vals: {}, qtd: 0 });
            const g = byMes.get(ym)!;
            if (!g.vals[sid]) g.vals[sid] = { value: 0, contribIds: [], anexos: [], notas: [] };
            g.vals[sid].value += e.value || 0;
            g.qtd += 1;
        });
        return [...byMes.entries()].map(([ym, g]) => ({ ym, vals: g.vals, qtd: g.qtd }));
    }, [project.expenses]);

    // Linhas da matriz: parcelas do plano + avulsos + despesas por mês, por data.
    // A linha do mês usa dia 31 para FECHAR o mês (cai depois das parcelas dele).
    const rows = useMemo(() => {
        const planRows = parcelas.map((p) => ({ kind: 'plan' as const, key: p.id, date: p.date, parcela: p }));
        const avRows = avulsoRows.map((a, i) => ({ kind: 'avulso' as const, key: `av-${a.date}-${i}`, date: a.date, vals: a.vals }));
        const dsRows = despesaRows.map((d) => ({ kind: 'despesa' as const, key: `ds-${d.ym}`, date: `${d.ym}-31`, ym: d.ym, qtd: d.qtd, vals: d.vals }));
        return [...planRows, ...avRows, ...dsRows].sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    }, [parcelas, avulsoRows, despesaRows]);

    // Rede de segurança: dinheiro de quem NÃO tem coluna na matriz (sem cota, sem
    // casa, marcado "não aporta", ou o "Recursos próprios" criado na abertura da
    // obra). Sem isso, tirar o extrato faria esse aporte sumir da tela.
    const foraDaMatriz = useMemo(() => {
        const comColuna = new Set(socios.map((s) => s.investorId));
        const porSocio = new Map<string, number>();
        (project.contributions || []).forEach((c: any) => {
            if (!c.investorId || comColuna.has(c.investorId)) return;
            porSocio.set(c.investorId, (porSocio.get(c.investorId) || 0) + (c.value || 0));
        });
        (project.expenses || []).forEach((e: any) => {
            if (!e.paidByInvestorId || comColuna.has(e.paidByInvestorId)) return;
            porSocio.set(e.paidByInvestorId, (porSocio.get(e.paidByInvestorId) || 0) + (e.value || 0));
        });
        const total = [...porSocio.values()].reduce((s, v) => s + v, 0);
        const nomes = [...porSocio.keys()].map((id) => (project.investors || []).find((i) => i.id === id)?.name || 'sócio sem nome');
        return { total, nomes };
    }, [project.contributions, project.expenses, project.investors, socios]);

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

    // Valor REALMENTE aportado numa célula paga (pode diferir do planejado, porque a
    // janela de confirmação deixa corrigir). Cai no planejado se o aporte sumiu do banco.
    const contribById = useMemo(() => {
        const m = new Map<string, { value: number; date: string; anexos: string[]; nota?: string }>();
        (project.contributions || []).forEach((c: any) => {
            if (!c.id) return;
            m.set(c.id, { value: c.value || 0, date: (c.date || '').slice(0, 10), anexos: (c.attachments || []).filter(Boolean), nota: c.description || undefined });
        });
        return m;
    }, [project.contributions]);

    // Clique no ✓: abre a janela de confirmação (valor e data já preenchidos, editáveis).
    const pedirConfirmacao = (parcela: AporteParcela, s: SocioCol) => {
        if (dirty) { alert('Salve o cronograma antes de dar baixa nos aportes.'); return; }
        const planned = parcela.values?.[s.investorId] || 0;
        setConfirmCell({
            parcelaId: parcela.id,
            investorId: s.investorId,
            socioName: s.name,
            value: String(planned || ''),
            date: parcela.date,
            planned,
        });
    };

    // Confirmou na janela: cria o aporte real (caixa/extrato) e liga na parcela.
    const confirmarPago = async () => {
        if (!confirmCell || busy) return;
        const value = parseFloat(String(confirmCell.value).replace(',', '.')) || 0;
        if (value <= 0) { alert('Informe o valor do aporte.'); return; }
        if (!confirmCell.date) { alert('Informe a data do aporte.'); return; }
        setBusy(true);
        try {
            const c: any = await addContribution.mutateAsync({
                projectId: project.id,
                investorId: confirmCell.investorId,
                value,
                date: confirmCell.date,
                description: 'Aporte do cronograma',
                attachments: confirmCell.attachment ? [confirmCell.attachment] : [],
            });
            const next = parcelas.map((p) => p.id === confirmCell.parcelaId ? { ...p, paidContrib: { ...(p.paidContrib || {}), [confirmCell.investorId]: c.id } } : p);
            setPlan({ parcelas: next });   // sincroniza local (evita corrida entre cliques)
            onUpdate?.(project.id, { aportePlan: { parcelas: next } });
            setConfirmCell(null);
        } catch (e: any) {
            alert('Erro ao registrar o aporte: ' + (e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    // Desfazer: apaga o aporte real (some do caixa e do extrato). Pergunta antes.
    const desfazerPago = async (parcela: AporteParcela, s: SocioCol) => {
        if (dirty) { alert('Salve o cronograma antes de dar baixa nos aportes.'); return; }
        if (busy) return;
        const contribId = parcela.paidContrib?.[s.investorId];
        if (!contribId) return;
        const real = contribById.get(contribId);
        const quanto = real ? formatCurrency(real.value) : formatCurrency(parcela.values?.[s.investorId] || 0);
        if (!window.confirm(`Desfazer o aporte de ${s.name} (${quanto})?\n\nO lançamento sai do caixa e do extrato.`)) return;
        setBusy(true);
        try {
            await deleteContribution.mutateAsync(contribId);
            const np = { ...(parcela.paidContrib || {}) }; delete np[s.investorId];
            const next = parcelas.map((p) => p.id === parcela.id ? { ...p, paidContrib: np } : p);
            setPlan({ parcelas: next });   // sincroniza local (evita corrida entre cliques)
            onUpdate?.(project.id, { aportePlan: { parcelas: next } });
        } catch (e: any) {
            alert('Erro ao desfazer o aporte: ' + (e?.message || e));
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
                <p className="text-slate-400 text-sm mt-2 mb-4">Cadastre os sócios (e as cotas, ou as casas de cada um) em <b>Configurar sócios</b> para montar a divisão e o cronograma de aportes.</p>
                {configSlot && <div className="-mx-5 -mb-5 border-t border-slate-700/60">{configSlot}</div>}
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
                    {/* Cadastro dos sócios: primeira coisa do card. */}
                    {configSlot && <div className="-mx-4 sm:-mx-5 border-b border-slate-700/60">{configSlot}</div>}

                    {/* Ação do dia a dia (lançar o que entrou) em destaque; MONTAR o plano
                        é coisa de uma vez só e fica recolhida atrás de "Planejar aportes". */}
                    <div className="flex flex-wrap items-center gap-2">
                        {onRegisterAporte && (
                            <button onClick={onRegisterAporte} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-600/20">
                                <i className="fa-solid fa-plus mr-1.5"></i> Registrar aporte
                            </button>
                        )}
                        <div className="flex-1"></div>
                        <button onClick={() => setShowPlanejar((v) => !v)} className="px-3 py-2 text-slate-400 hover:text-white text-xs font-black uppercase tracking-widest">
                            <i className="fa-solid fa-calendar-days mr-1.5"></i>
                            {parcelas.length > 0 ? 'Refazer o plano' : 'Planejar aportes'}
                            <i className={`fa-solid fa-chevron-down ml-1.5 text-[10px] transition-transform ${showPlanejar ? 'rotate-180' : ''}`}></i>
                        </button>
                    </div>

                    {showPlanejar && (
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
                            {parcelas.length > 0 && <p className="text-[10px] text-amber-400/90 font-bold w-full">Gerar de novo <b>substitui</b> as parcelas que estão na tabela (as já pagas você teria que remarcar).</p>}
                        </div>
                    )}

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
                                    <tr><td colSpan={socios.length + 2} className="px-2 py-6 text-center text-slate-500 text-sm">Nenhum aporte ainda. Use <b>Registrar aporte</b> pra lançar o que já entrou, ou <b>Iguais</b>/<b>Pelo ritmo</b> pra montar o plano.</td></tr>
                                )}
                                {rows.map((row) => (
                                    <tr key={row.key} className="border-t border-slate-800">
                                        <td className="px-2 py-1.5 whitespace-nowrap">
                                            {row.kind === 'plan' && (
                                                <input type="date" value={row.parcela!.date} onChange={(e) => setDate(row.parcela!.id, e.target.value)} className={`${inputCls} w-32`} />
                                            )}
                                            {row.kind === 'avulso' && (
                                                <span className="text-slate-400 text-xs">{row.date !== '—' ? new Date(row.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'sem data'} <span className="text-emerald-500/70">· avulso</span></span>
                                            )}
                                            {row.kind === 'despesa' && (
                                                <span className="text-slate-400 text-xs">{labelMes(row.ym!)} <span className="text-amber-500/80">· em despesas ({row.qtd})</span></span>
                                            )}
                                        </td>
                                        {socios.map((s) => {
                                            if (row.kind === 'plan') {
                                                const p = row.parcela!;
                                                const contribId = p.paidContrib?.[s.investorId];
                                                const paid = !!contribId;
                                                const val = p.values?.[s.investorId] ?? 0;
                                                // Pago mostra o valor REAL (pode ter sido corrigido na confirmação).
                                                const real = contribId ? contribById.get(contribId) : undefined;
                                                const mostrado = paid && real ? real.value : val;
                                                const difere = paid && real && Math.abs(real.value - val) > 1;
                                                return (
                                                    <td key={s.investorId} className="px-2 py-1.5 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {dirty ? (
                                                                <input type="number" min={0} value={val || ''} placeholder="0" onChange={(e) => setValue(p.id, s.investorId, parseFloat(e.target.value) || 0)} className={`${inputCls} w-24 text-right`} />
                                                            ) : (
                                                                <span className={paid ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                                                                    {mostrado > 0 ? formatCurrencyAbbrev(mostrado) : '—'}
                                                                    {difere && <span className="block text-[9px] font-normal text-slate-500">plan. {formatCurrencyAbbrev(val)}</span>}
                                                                </span>
                                                            )}
                                                            {!dirty && paid && !!real?.anexos.length && (
                                                                <button onClick={() => openAttachment(real.anexos[0])} title="Ver comprovante" className="text-blue-400 hover:text-blue-300 shrink-0">
                                                                    <i className="fa-solid fa-paperclip text-xs"></i>
                                                                </button>
                                                            )}
                                                            {!dirty && val > 0 && (
                                                                <button onClick={() => paid ? desfazerPago(p, s) : pedirConfirmacao(p, s)} disabled={busy} title={paid ? 'Pago (clique pra desfazer)' : 'Dar como pago'}
                                                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${paid ? 'bg-emerald-500 text-white' : 'border border-slate-600 text-slate-500 hover:border-emerald-400 hover:text-emerald-400'}`}>
                                                                    <i className={`fa-solid ${paid ? 'fa-check' : 'fa-clock'}`}></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            const cell: CellReal | undefined = (row.vals as any)[s.investorId];
                                            const despesa = row.kind === 'despesa';
                                            return (
                                                <td key={s.investorId} className="px-2 py-1.5 text-right" title={cell?.notas.join(' · ') || undefined}>
                                                    {cell ? (
                                                        <span className={`font-bold ${despesa ? 'text-amber-400/90' : 'text-emerald-400'}`}>
                                                            {formatCurrencyAbbrev(cell.value)}
                                                            {!despesa && <i className="fa-solid fa-check text-[10px] ml-1"></i>}
                                                            {cell.anexos.length > 0 && (
                                                                <button onClick={() => openAttachment(cell.anexos[0])} title="Ver comprovante" className="text-blue-400 hover:text-blue-300 ml-1.5">
                                                                    <i className="fa-solid fa-paperclip text-xs"></i>
                                                                </button>
                                                            )}
                                                        </span>
                                                    ) : <span className="text-slate-600">—</span>}
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-1.5 text-center">
                                            {row.kind === 'plan' && <button onClick={() => removeParcela(row.parcela!.id)} className="text-slate-500 hover:text-rose-400" title="Remover parcela"><i className="fa-solid fa-trash text-xs"></i></button>}
                                            {row.kind === 'avulso' && <button onClick={() => removeAvulso(Object.values(row.vals as any).flatMap((v: any) => v.contribIds))} className="text-slate-500 hover:text-rose-400" title="Apagar aporte"><i className="fa-solid fa-trash text-xs"></i></button>}
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
                    {!dirty && (
                        <p className="text-[10px] text-slate-500 leading-snug">
                            {parcelas.length > 0 && <>Clique no ✓ de cada valor para dar como <b>pago</b> — isso registra o aporte de verdade (entra no caixa). Aportes fora do plano aparecem como linhas <span className="text-emerald-500">avulso</span>. </>}
                            {despesaRows.length > 0 && <>As linhas <span className="text-amber-500/90">em despesas</span> são as compras que o sócio pagou do próprio bolso (também contam como aporte) — some o mês inteiro; para mexer nelas, vá na aba <b>Despesas</b>.</>}
                        </p>
                    )}
                    {foraDaMatriz.total > 0 && (
                        <p className="text-[11px] text-amber-400 font-bold leading-snug bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                            {formatCurrency(foraDaMatriz.total)} de aporte de <b>{foraDaMatriz.nomes.join(', ')}</b> não cabe na tabela: {foraDaMatriz.nomes.length > 1 ? 'esses sócios não têm' : 'esse sócio não tem'} cota {project.splitMode === 'unit' ? 'nem casa' : ''} definida. O dinheiro está no caixa. Ajuste em <b>Configurar sócios</b>{project.splitMode === 'unit' ? ' ou defina o dono da casa na aba Unidades' : ''}.
                        </p>
                    )}

                </div>
            )}

            {/* Confirmação do aporte: valor e data vêm preenchidos, mas dá pra corrigir
                (o sócio raramente paga exatamente o planejado, no dia exato). */}
            {confirmCell && ReactDOM.createPortal(
                <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4" onClick={() => !busy && setConfirmCell(null)}>
                    <div className="glass rounded-2xl border border-slate-700 w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <h4 className="font-black text-white text-lg flex items-center gap-2">
                            <i className="fa-solid fa-hand-holding-dollar text-emerald-400"></i> Registrar aporte
                        </h4>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sócio</p>
                            <p className="text-white font-bold">{confirmCell.socioName}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-black uppercase text-slate-500">Valor (R$)</label>
                                <input type="number" min={0} step="0.01" inputMode="decimal" autoFocus
                                    value={confirmCell.value}
                                    onChange={(e) => setConfirmCell({ ...confirmCell, value: e.target.value })}
                                    className={`${inputCls} w-full`} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-black uppercase text-slate-500">Data</label>
                                <input type="date" value={confirmCell.date}
                                    onChange={(e) => setConfirmCell({ ...confirmCell, date: e.target.value })}
                                    className={`${inputCls} w-full`} />
                            </div>
                        </div>
                        {confirmCell.planned > 0 && Math.abs((parseFloat(String(confirmCell.value).replace(',', '.')) || 0) - confirmCell.planned) > 1 && (
                            <p className="text-[11px] text-amber-400 font-bold">
                                <i className="fa-solid fa-circle-info mr-1"></i>
                                Diferente do planejado ({formatCurrency(confirmCell.planned)}). O plano continua igual; entra o valor real.
                            </p>
                        )}
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Comprovante (opcional)</label>
                            <AttachmentUpload
                                value={confirmCell.attachment}
                                onChange={(url) => setConfirmCell((c) => (c ? { ...c, attachment: url } : c))}
                                bucketName="expense-attachments"
                            />
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug">Ao confirmar, o aporte entra no <b>caixa da obra</b>.</p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmCell(null)} disabled={busy}
                                className="flex-1 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white font-black text-sm">
                                Cancelar
                            </button>
                            <button onClick={confirmarPago} disabled={busy}
                                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2">
                                {busy ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                                {busy ? 'Salvando…' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.getElementById('modal-root') || document.body
            )}
        </div>
    );
};

export default AporteScheduleSection;
