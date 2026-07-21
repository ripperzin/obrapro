import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Project, AportePlan, AporteParcela } from '../types';
import { formatCurrency, generateId } from '../utils';
import { computeAporteShares } from '../utils/projectFinance';
import {
    generateAporteScheduleEqual,
    generateAporteScheduleByRitmo,
    computeAporteScheduleStatus,
    parcelaTotal,
} from '../utils/aportePlan';

interface Props {
    project: Project;
    onUpdate?: (projectId: string, updates: Partial<Project>) => void;
}

const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-sm focus:border-blue-500 focus:outline-none';

// Cronograma de aportes: tabela Parcelas (datas) × Sócios, com sugestão
// automática (parcelas iguais ou pelo ritmo da obra) e cruzamento com o que
// cada sócio já aportou. Funciona nos dois modos (% e por casa).
const AporteScheduleSection: React.FC<Props> = ({ project, onUpdate }) => {
    const acerto = useMemo(() => computeAporteShares(project), [project]);
    // Só sócios com id viram coluna (o valor da parcela é guardado por investorId).
    const socios = acerto.shares.filter((s) => s.investorId);

    const [plan, setPlan] = useState<AportePlan>(project.aportePlan || { parcelas: [] });
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const [open, setOpen] = useState(false);

    // Adota o que vem do banco só quando NÃO há edição pendente. Usa ref (não o
    // estado dirty) pra não resetar o plano no instante do salvar — senão piscaria
    // o valor antigo até o refetch confirmar.
    useEffect(() => {
        if (!dirtyRef.current) setPlan(project.aportePlan || { parcelas: [] });
    }, [project.aportePlan]);

    // Controles da sugestão "parcelas iguais"
    const [nParcelas, setNParcelas] = useState(10);
    const [intervalo, setIntervalo] = useState(21); // dias entre parcelas
    const [inicio, setInicio] = useState(project.startDate || new Date().toISOString().slice(0, 10));

    const status = useMemo(() => computeAporteScheduleStatus(project, plan, new Date()), [project, plan]);
    const parcelas = plan.parcelas || [];

    const setParcelas = (ps: AporteParcela[]) => { setPlan({ parcelas: ps }); dirtyRef.current = true; setDirty(true); };

    const sugerirIguais = () => {
        setParcelas(generateAporteScheduleEqual(socios, { nParcelas, startDate: inicio, intervalDays: intervalo }).parcelas);
        setOpen(true);
    };
    const sugerirRitmo = () => {
        const p = generateAporteScheduleByRitmo(project, socios);
        if (!p) { alert('Gere o cronograma da obra primeiro (aba Orçamento → "Gerar cronograma"). Sem ele não dá pra distribuir os aportes pelo ritmo.'); return; }
        setParcelas(p.parcelas);
        setOpen(true);
    };
    const addParcela = () => {
        const last = parcelas[parcelas.length - 1];
        const base = last ? new Date(last.date + 'T00:00:00').getTime() + intervalo * 86400000 : new Date(inicio + 'T00:00:00').getTime();
        setParcelas([...parcelas, { id: generateId(), date: new Date(base).toISOString().slice(0, 10), values: {} }]);
    };
    const removeParcela = (id: string) => setParcelas(parcelas.filter((p) => p.id !== id));
    const setDate = (id: string, date: string) => setParcelas(parcelas.map((p) => p.id === id ? { ...p, date } : p));
    const setValue = (id: string, investorId: string, v: number) =>
        setParcelas(parcelas.map((p) => p.id === id ? { ...p, values: { ...p.values, [investorId]: v } } : p));

    const salvar = () => { onUpdate?.(project.id, { aportePlan: plan }); dirtyRef.current = false; setDirty(false); };
    const limpar = () => { if (window.confirm('Apagar o cronograma de aportes desta obra?')) { setParcelas([]); } };

    const totalPorSocio = (investorId: string) => parcelas.reduce((s, p) => s + (p.values?.[investorId] || 0), 0);
    const totalGeral = parcelas.reduce((s, p) => s + parcelaTotal(p), 0);

    if (acerto.semBase || socios.length === 0) {
        return (
            <div className="glass rounded-2xl border border-slate-700 p-5">
                <h3 className="font-black text-white flex items-center gap-2"><i className="fa-solid fa-calendar-check text-blue-400"></i> Cronograma de aportes</h3>
                <p className="text-slate-400 text-sm mt-2">Defina os sócios e as cotas (ou as casas de cada um) para montar o cronograma de aportes.</p>
            </div>
        );
    }

    const toneCls: Record<string, string> = {
        em_dia: 'text-emerald-400', atrasado: 'text-rose-400', adiantado: 'text-blue-400', sem_plano: 'text-slate-500',
    };
    const toneLabel: Record<string, string> = {
        em_dia: 'em dia', atrasado: 'atrasado', adiantado: 'adiantado', sem_plano: '—',
    };

    return (
        <div className="glass rounded-2xl border border-slate-700 overflow-hidden">
            <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-5 text-left">
                <h3 className="font-black text-white flex items-center gap-2">
                    <i className="fa-solid fa-calendar-check text-blue-400"></i> Cronograma de aportes
                    {parcelas.length > 0 && <span className="text-xs font-bold text-slate-400">({parcelas.length} parcelas · {formatCurrency(totalGeral)})</span>}
                </h3>
                <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-slate-500`}></i>
            </button>

            {open && (
                <div className="px-5 pb-5 space-y-4">
                    {/* Cruzamento planejado × realizado por sócio */}
                    {parcelas.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {status.map((s) => (
                                <div key={s.investorId} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white font-bold text-sm truncate">{s.name}</span>
                                        <span className={`text-[11px] font-black uppercase ${toneCls[s.tone]}`}>{toneLabel[s.tone]}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        Devia até hoje <b className="text-slate-300">{formatCurrency(s.planejadoAteHoje)}</b> · aportou <b className="text-slate-300">{formatCurrency(s.aportado)}</b>
                                    </p>
                                    {s.tone === 'atrasado' && <p className="text-[11px] text-rose-400 font-bold">falta pôr {formatCurrency(-s.diferenca)}</p>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Sugestões automáticas */}
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
                        <button onClick={sugerirIguais} className="px-3 py-2 bg-blue-600/20 border border-blue-500/40 rounded-lg text-blue-300 hover:bg-blue-600/30 text-sm font-black">
                            <i className="fa-solid fa-wand-magic-sparkles mr-1"></i> Parcelas iguais
                        </button>
                        <button onClick={sugerirRitmo} className="px-3 py-2 bg-purple-600/20 border border-purple-500/40 rounded-lg text-purple-300 hover:bg-purple-600/30 text-sm font-black">
                            <i className="fa-solid fa-chart-line mr-1"></i> Pelo ritmo da obra
                        </button>
                    </div>

                    {/* Tabela editável */}
                    {parcelas.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-[10px] font-black uppercase text-slate-500">
                                        <th className="text-left px-2 py-2">Data</th>
                                        {socios.map((s) => (
                                            <th key={s.investorId} className="text-right px-2 py-2 whitespace-nowrap">{s.name}</th>
                                        ))}
                                        <th className="text-right px-2 py-2">Total</th>
                                        <th className="px-2 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parcelas.map((p, i) => (
                                        <tr key={p.id} className="border-t border-slate-800">
                                            <td className="px-2 py-1.5">
                                                <input type="date" value={p.date} onChange={(e) => setDate(p.id, e.target.value)} className={`${inputCls} w-36`} />
                                            </td>
                                            {socios.map((s) => (
                                                <td key={s.investorId} className="px-2 py-1.5 text-right">
                                                    <input type="number" min={0} value={p.values?.[s.investorId!] ?? ''} placeholder="0"
                                                        onChange={(e) => setValue(p.id, s.investorId!, parseFloat(e.target.value) || 0)}
                                                        className={`${inputCls} w-24 text-right`} />
                                                </td>
                                            ))}
                                            <td className="px-2 py-1.5 text-right font-bold text-white whitespace-nowrap">{formatCurrency(parcelaTotal(p))}</td>
                                            <td className="px-2 py-1.5 text-center">
                                                <button onClick={() => removeParcela(p.id)} className="text-slate-500 hover:text-rose-400" title="Remover parcela"><i className="fa-solid fa-trash text-xs"></i></button>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 border-slate-700 font-black text-white">
                                        <td className="px-2 py-2 text-[10px] uppercase text-slate-400">Total</td>
                                        {socios.map((s) => (
                                            <td key={s.investorId} className="px-2 py-2 text-right whitespace-nowrap">{formatCurrency(totalPorSocio(s.investorId!))}</td>
                                        ))}
                                        <td className="px-2 py-2 text-right text-blue-400 whitespace-nowrap">{formatCurrency(totalGeral)}</td>
                                        <td></td>
                                    </tr>
                                    {/* Confere com a meta de cada sócio */}
                                    <tr className="text-[10px] text-slate-500">
                                        <td className="px-2 py-1">meta</td>
                                        {socios.map((s) => {
                                            const bate = Math.abs(totalPorSocio(s.investorId!) - s.meta) < 1;
                                            return <td key={s.investorId} className={`px-2 py-1 text-right ${bate ? 'text-emerald-500' : 'text-amber-500'}`}>{formatCurrency(s.meta)}</td>;
                                        })}
                                        <td className="px-2 py-1 text-right">{formatCurrency(acerto.totalMeta)}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-slate-400 text-sm">Nenhuma parcela ainda. Use um dos botões acima para sugerir automaticamente, ou <button onClick={addParcela} className="text-blue-400 font-bold underline">adicione uma parcela</button> na mão.</p>
                    )}

                    {/* Ações */}
                    <div className="flex flex-wrap items-center gap-2">
                        {parcelas.length > 0 && <button onClick={addParcela} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white text-sm font-black"><i className="fa-solid fa-plus mr-1"></i> Parcela</button>}
                        <div className="flex-1"></div>
                        {parcelas.length > 0 && <button onClick={limpar} className="px-3 py-2 text-slate-500 hover:text-rose-400 text-sm font-bold">Limpar</button>}
                        {dirty && <button onClick={salvar} className="px-5 py-2 bg-green-600 text-white rounded-lg font-black text-sm hover:bg-green-700 shadow-lg shadow-green-600/30"><i className="fa-solid fa-check mr-1"></i> Salvar cronograma</button>}
                    </div>
                    {dirty && <p className="text-[11px] text-amber-400 font-bold text-right">Alterações não salvas.</p>}
                </div>
            )}
        </div>
    );
};

export default AporteScheduleSection;
