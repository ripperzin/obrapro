import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { planLabel } from '../hooks/useEntitlements';

// Uma linha do painel = um cliente. Vem inteira da função admin_overview()
// (SECURITY DEFINER), que aplica a régua: CONTAGEM sim, CONTEÚDO não.
interface Cliente {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    role: string;
    plan: string;
    criado_em: string;
    ultimo_login: string | null;
    obras: number;
    obras_ativas: number;
    despesas: number;
    ultimo_lancamento: string | null;
    ocr_mes: number;
    copiloto_mes: number;
}

const diasDesde = (iso?: string | null): number | null => {
    if (!iso) return null;
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
};

const haQuantoTempo = (iso?: string | null): string => {
    const d = diasDesde(iso);
    if (d === null) return 'nunca';
    if (d === 0) return 'hoje';
    if (d === 1) return 'ontem';
    if (d < 30) return `há ${d} dias`;
    if (d < 60) return 'há 1 mês';
    return `há ${Math.floor(d / 30)} meses`;
};

const dataBR = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

// Verde = mexeu essa semana · âmbar = sumindo · vermelho = sumiu (risco de cancelar)
const tomAtividade = (dias: number | null) => {
    if (dias === null) return 'text-slate-500';
    if (dias <= 7) return 'text-emerald-400';
    if (dias <= 30) return 'text-amber-400';
    return 'text-rose-400';
};

const PLAN_COR: Record<string, string> = {
    free: 'bg-slate-700 text-slate-300',
    pro: 'bg-blue-600/20 text-blue-300 border border-blue-500/40',
    business: 'bg-purple-600/20 text-purple-300 border border-purple-500/40',
};

const Tile: React.FC<{ label: string; valor: string; cor?: string; nota?: string }> = ({ label, valor, cor = 'text-white', nota }) => (
    <div className="glass rounded-2xl border border-slate-700 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-black ${cor}`}>{valor}</p>
        {nota && <p className="text-[10px] text-slate-500 mt-0.5">{nota}</p>}
    </div>
);

/**
 * Painel do DONO DO APP (o negócio) — não confundir com a "Gestão de Equipe",
 * que é o dono da OBRA liberando obras pros funcionários dele.
 *
 * Mostra só metadado: quantas obras, quantos lançamentos, quando mexeu, quanto
 * de IA gastou. Nunca nome de obra, valor ou foto — a privacidade do cliente
 * não é moeda de troca por comodidade minha.
 */
const OwnerPanel: React.FC = () => {
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const { data, error } = await supabase.rpc('admin_overview');
                if (error) throw error;
                setClientes((data || []) as Cliente[]);
            } catch (e: any) {
                setErro(e.message || 'Não consegui carregar os clientes.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return <div className="p-8 text-slate-400">Carregando clientes…</div>;
    if (erro) {
        return (
            <div className="p-6 bg-rose-900/20 border border-rose-500/40 rounded-2xl text-rose-200 text-sm">
                <i className="fa-solid fa-triangle-exclamation mr-2"></i>{erro}
            </div>
        );
    }

    // ---- Termômetro do negócio
    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    const novosNoMes = clientes.filter(c => (c.criado_em || '').slice(0, 7) === mesAtual).length;
    const ativos7 = clientes.filter(c => { const d = diasDesde(c.ultimo_lancamento); return d !== null && d <= 7; }).length;
    const porPlano = (p: string) => clientes.filter(c => (c.plan || 'free') === p).length;
    const ocrMes = clientes.reduce((s, c) => s + (c.ocr_mes || 0), 0);
    const copilotoMes = clientes.reduce((s, c) => s + (c.copiloto_mes || 0), 0);

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* ---- Termômetro */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile label="Clientes" valor={String(clientes.length)} nota={novosNoMes > 0 ? `+${novosNoMes} este mês` : 'nenhum novo este mês'} />
                <Tile label="Mexeram na semana" valor={String(ativos7)} cor={ativos7 > 0 ? 'text-emerald-400' : 'text-slate-500'} nota="lançaram despesa nos últimos 7 dias" />
                <Tile label="Pagantes" valor={String(porPlano('pro') + porPlano('business'))} cor="text-blue-400" nota={`${porPlano('free')} no grátis`} />
                <Tile label="IA no mês" valor={`${ocrMes + copilotoMes}`} cor="text-purple-300" nota={`${ocrMes} leituras de nota · ${copilotoMes} copiloto`} />
            </div>

            {/* ---- Lista de clientes */}
            <div>
                <h3 className="text-white font-black text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-users text-blue-400"></i> Clientes
                </h3>

                <div className="space-y-3">
                    {clientes.map(c => {
                        const diasLanc = diasDesde(c.ultimo_lancamento);
                        return (
                            <div key={c.id} className="glass rounded-2xl border border-slate-700 p-4">
                                {/* Identificação + plano */}
                                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                                    <div className="min-w-0">
                                        <p className="text-white font-black truncate">
                                            {c.full_name || c.email.split('@')[0]}
                                            {c.role === 'admin' && (
                                                <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-purple-300">
                                                    <i className="fa-solid fa-crown mr-1"></i>dono do app
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-xs text-slate-400 truncate">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shrink-0 ${PLAN_COR[c.plan] || PLAN_COR.free}`}>
                                        {planLabel(c.plan as any)}
                                    </span>
                                </div>

                                {/* Uso — contagem, nunca conteúdo */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border-t border-slate-700/60 pt-3">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Obras</p>
                                        <p className="text-sm font-black text-white">{c.obras_ativas}<span className="text-slate-500 text-xs"> de {c.obras}</span></p>
                                        <p className="text-[9px] text-slate-600">ativas</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Lançamentos</p>
                                        <p className="text-sm font-black text-white">{c.despesas}</p>
                                        <p className="text-[9px] text-slate-600">despesas</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Último uso</p>
                                        <p className={`text-sm font-black ${tomAtividade(diasLanc)}`}>{haQuantoTempo(c.ultimo_lancamento)}</p>
                                        <p className="text-[9px] text-slate-600">lançou despesa</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">IA no mês</p>
                                        <p className="text-sm font-black text-purple-300">{c.ocr_mes + c.copiloto_mes}</p>
                                        <p className="text-[9px] text-slate-600">{c.ocr_mes} nota · {c.copiloto_mes} copiloto</p>
                                    </div>
                                </div>

                                <p className="text-[10px] text-slate-600 mt-3">
                                    Cliente desde {dataBR(c.criado_em)} · último login {haQuantoTempo(c.ultimo_login)}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-snug bg-slate-800/40 border border-slate-700 rounded-2xl p-4">
                <i className="fa-solid fa-shield-halved text-slate-400 mr-2"></i>
                Este painel mostra só <b>quanto</b> cada cliente usa — nunca o que ele lançou. Nome de obra, valor,
                foto e nota fiscal não passam por aqui.
                <br />
                <span className="text-slate-600">
                    "Último uso" é a data da última despesa lançada — é o sinal de que a conta está viva. O "último login"
                    só muda quando a pessoa digita a senha de novo, então costuma ficar velho mesmo com a conta em uso.
                </span>
            </p>
        </div>
    );
};

export default OwnerPanel;
