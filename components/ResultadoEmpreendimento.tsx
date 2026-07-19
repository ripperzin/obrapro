import React from 'react';
import { Project } from '../types';
import { formatCurrency } from '../utils';
import { computeProjectFinance } from '../utils/projectFinance';

interface Props {
    project: Project;
    bare?: boolean;   // true = sem moldura/título próprios (ex.: dentro de um card recolhível)
}

const ResultadoEmpreendimento: React.FC<Props> = ({ project, bare = false }) => {
    const f = computeProjectFinance(project);

    const isCompleted = project.progress >= 100;
    const disponiveis = f.unidadesTotais - f.unidadesVendidas;

    const projPositivo = f.lucroProjetado >= 0;
    const realPositivo = f.lucroReal >= 0;
    const temVenda = f.unidadesVendidas > 0;
    // Sem valor de venda estimado não há o que projetar (evita "lucro" negativo sem sentido).
    const temProjecao = f.vendasEstimadasTotais > 0;

    const inner = (
        <>
            {/* Projetado vs Realizado, lado a lado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* PROJETADO */}
                <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3">
                        <i className="fa-solid fa-chart-line mr-1"></i> Projetado <span className="text-slate-500 normal-case font-medium">(tudo vendido)</span>
                    </p>
                    {temProjecao ? (
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Vendas estimadas</span>
                                <span className="text-white font-bold">{formatCurrency(f.vendasEstimadasTotais)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">− Obra <span className="text-slate-600 text-xs">(orçamento)</span></span>
                                <span className="text-slate-300">{formatCurrency(f.custoObraProjetado)}</span>
                            </div>
                            {f.terrenoProjetado > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-slate-400">− Terreno</span>
                                    <span className="text-slate-300">{formatCurrency(f.terrenoProjetado)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-baseline border-t border-slate-700/60 pt-2 mt-1">
                                <span className="text-white font-black uppercase text-[10px] tracking-widest">Lucro projetado</span>
                                <span className={`font-black text-lg ${projPositivo ? 'text-cyan-400' : 'text-rose-400'}`}>
                                    {formatCurrency(f.lucroProjetado)}
                                </span>
                            </div>
                            <p className="text-right text-[11px] text-slate-500">margem de {f.margemPct.toFixed(1)}%</p>
                            {f.unidadesComPreco < f.unidadesTotais && (
                                <p className="text-[11px] text-amber-400/90 leading-snug pt-1">
                                    <i className="fa-solid fa-circle-info mr-1"></i>
                                    Projeção só das {f.unidadesComPreco} de {f.unidadesTotais} casas com preço. Defina o valor de venda das demais em <b>Unidades</b>.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                            <i className="fa-solid fa-chart-line text-slate-600 text-xl mb-2"></i>
                            <p className="text-slate-500 text-xs font-bold">Sem projeção ainda</p>
                            <p className="text-slate-600 text-[11px] mt-1 leading-snug">Defina o valor de venda das casas em Unidades para ver o lucro projetado.</p>
                        </div>
                    )}
                </div>

                {/* REALIZADO */}
                <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3">
                        <i className="fa-solid fa-circle-check mr-1"></i> Realizado <span className="text-slate-500 normal-case font-medium">(casas vendidas)</span>
                    </p>
                    {temVenda ? (
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Vendido</span>
                                <span className="text-white font-bold">{f.unidadesVendidas}/{f.unidadesTotais} casas</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Liquidado</span>
                                <span className="text-white font-bold">{formatCurrency(f.vendasRealizadas)}</span>
                            </div>
                            {isCompleted ? (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">− Custo real</span>
                                        <span className="text-slate-300">{formatCurrency(f.custoRealVendidas)}</span>
                                    </div>
                                    <div className="flex justify-between items-baseline border-t border-slate-700/60 pt-2 mt-1">
                                        <span className="text-white font-black uppercase text-[10px] tracking-widest">Lucro real</span>
                                        <span className={`font-black text-lg ${realPositivo ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {formatCurrency(f.lucroReal)}
                                        </span>
                                    </div>
                                    <p className="text-right text-[11px] text-slate-500">margem de {f.margemRealPct.toFixed(1)}%</p>
                                </>
                            ) : (
                                <div className="border-t border-slate-700/60 pt-3 mt-1 flex items-center gap-2 text-slate-500">
                                    <i className="fa-solid fa-lock"></i>
                                    <p className="text-[11px] font-bold leading-snug">Lucro real disponível ao concluir a obra</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full py-6 text-center">
                            <i className="fa-solid fa-tag text-slate-600 text-xl mb-2"></i>
                            <p className="text-slate-500 text-xs font-bold">Nenhuma casa vendida ainda</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 3) A vender */}
            {disponiveis > 0 && (
                <p className="mt-3 text-[11px] text-slate-500">
                    <i className="fa-solid fa-circle-info mr-1"></i>
                    A vender: {formatCurrency(f.vendasPotencial)} · {disponiveis} casa{disponiveis > 1 ? 's' : ''} disponíve{disponiveis > 1 ? 'is' : 'l'}
                </p>
            )}
        </>
    );

    if (bare) return inner;

    return (
        <div className="glass rounded-2xl border border-slate-700 p-5 mb-8">
            <h3 className="text-white font-black text-xs uppercase tracking-widest mb-5 flex items-center gap-2">
                <i className="fa-solid fa-scale-balanced text-blue-400"></i> Resultado do Empreendimento
            </h3>
            {inner}
        </div>
    );
};

export default ResultadoEmpreendimento;
