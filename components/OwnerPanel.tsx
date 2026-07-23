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
    blocked: boolean;
    trial_until: string | null;
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

// Dias que faltam da cortesia (null = sem cortesia ou já venceu).
const diasCortesia = (trialUntil?: string | null): number | null => {
    if (!trialUntil) return null;
    const fim = new Date(trialUntil + 'T23:59:59');
    if (isNaN(fim.getTime())) return null;
    const dias = Math.ceil((fim.getTime() - Date.now()) / 86400000);
    return dias > 0 ? dias : null;
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
// Formulário de criar cliente — chama admin-actions/create_user (Admin API no
// servidor). Feito pro Victor abrir contas Free e ObraPro e testar cada plano.
const NovoClienteForm: React.FC<{ open: boolean; setOpen: (v: boolean) => void; onCriado: () => void }> = ({ open, setOpen, onCriado }) => {
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [plan, setPlan] = useState('free');
    const [saving, setSaving] = useState(false);
    const inCls = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:border-blue-500 focus:outline-none w-full';

    if (!open) return null;

    const criar = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const { data, error } = await supabase.functions.invoke('admin-actions', {
                body: { action: 'create_user', email, password, fullName, plan },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            alert(`Cliente criado! Entre com ${email} e a senha que você definiu.`);
            setEmail(''); setFullName(''); setPassword(''); setPlan('free');
            setOpen(false);
            onCriado();
        } catch (e: any) {
            alert('Erro ao criar cliente: ' + (e.message || e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="glass rounded-2xl border border-blue-500/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-white font-black text-sm flex items-center gap-2"><i className="fa-solid fa-user-plus text-blue-400"></i> Novo cliente</h4>
                <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
                <input className={inCls} placeholder="Nome" value={fullName} onChange={e => setFullName(e.target.value)} />
                <input className={inCls} placeholder="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                <input className={inCls} placeholder="Senha (mín. 6)" value={password} onChange={e => setPassword(e.target.value)} />
                <select className={inCls} value={plan} onChange={e => setPlan(e.target.value)}>
                    <option value="free">Plano Free</option>
                    <option value="pro">Plano ObraPro</option>
                    <option value="business">Plano Business</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={criar} disabled={saving} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-black flex items-center gap-2">
                    {saving ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                    {saving ? 'Criando…' : 'Criar cliente'}
                </button>
                <p className="text-[11px] text-slate-500">A conta já entra valendo. Você pode trocar o plano ou dar cortesia depois.</p>
            </div>
        </div>
    );
};

const OwnerPanel: React.FC = () => {
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);   // cliente em ação
    const [showNovo, setShowNovo] = useState(false);

    const carregar = async () => {
        try {
            const { data, error } = await supabase.rpc('admin_overview');
            if (error) throw error;
            setClientes((data || []) as Cliente[]);
        } catch (e: any) {
            setErro(e.message || 'Não consegui carregar os clientes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    // Toda mudança passa pela edge function admin-actions (a única que pode).
    const acao = async (action: string, args: Record<string, unknown>, id: string) => {
        setBusyId(id);
        try {
            const { data, error } = await supabase.functions.invoke('admin-actions', { body: { action, ...args } });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            await carregar();
            return data;
        } catch (e: any) {
            alert('Erro: ' + (e.message || e));
            return null;
        } finally {
            setBusyId(null);
        }
    };

    const trocarPlano = (c: Cliente, plan: string) => { if (plan !== c.plan) acao('set_plan', { userId: c.id, plan }, c.id); };
    const darCortesia = (c: Cliente) => {
        const dias = window.prompt(`Quantos dias de ObraPro grátis dar para ${c.full_name || c.email}?`, '15');
        if (dias === null) return;
        const n = parseInt(dias);
        if (!(n > 0)) { alert('Informe um número de dias maior que zero.'); return; }
        acao('set_trial', { userId: c.id, days: n }, c.id);
    };
    const tirarCortesia = (c: Cliente) => { if (window.confirm('Remover a cortesia deste cliente?')) acao('set_trial', { userId: c.id, days: 0 }, c.id); };
    const alternarBloqueio = (c: Cliente) => {
        const texto = c.blocked ? `Reativar ${c.full_name || c.email}?` : `Suspender ${c.full_name || c.email}? Ele não conseguirá mais entrar (os dados ficam guardados).`;
        if (window.confirm(texto)) acao('set_blocked', { userId: c.id, blocked: !c.blocked }, c.id);
    };

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

            {/* ---- Novo cliente */}
            <NovoClienteForm open={showNovo} setOpen={setShowNovo} onCriado={carregar} />

            {/* ---- Lista de clientes */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                        <i className="fa-solid fa-users text-blue-400"></i> Clientes
                    </h3>
                    {!showNovo && (
                        <button onClick={() => setShowNovo(true)} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black">
                            <i className="fa-solid fa-user-plus mr-1.5"></i> Novo cliente
                        </button>
                    )}
                </div>

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
                                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                        {c.blocked && (
                                            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/40">
                                                <i className="fa-solid fa-ban mr-1"></i>suspenso
                                            </span>
                                        )}
                                        {diasCortesia(c.trial_until) !== null && (
                                            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">
                                                <i className="fa-solid fa-gift mr-1"></i>cortesia {diasCortesia(c.trial_until)}d
                                            </span>
                                        )}
                                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg ${PLAN_COR[c.plan] || PLAN_COR.free}`}>
                                            {planLabel(c.plan as any)}
                                        </span>
                                    </div>
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
                                    {c.trial_until && <> · cortesia até {dataBR(c.trial_until)}</>}
                                </p>

                                {/* Ações — só para clientes; no seu próprio cadastro não faz sentido. */}
                                {c.role !== 'admin' && (
                                    <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-slate-700/60">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plano</label>
                                        <select
                                            value={c.plan}
                                            disabled={busyId === c.id}
                                            onChange={e => trocarPlano(c, e.target.value)}
                                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs font-bold outline-none focus:border-blue-500"
                                        >
                                            <option value="free">Free</option>
                                            <option value="pro">ObraPro</option>
                                            <option value="business">Business</option>
                                        </select>

                                        {c.trial_until
                                            ? <button onClick={() => tirarCortesia(c)} disabled={busyId === c.id} className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white text-xs font-black"><i className="fa-solid fa-gift mr-1"></i> Tirar cortesia</button>
                                            : <button onClick={() => darCortesia(c)} disabled={busyId === c.id} className="px-2.5 py-1.5 bg-emerald-600/20 border border-emerald-500/40 rounded-lg text-emerald-300 hover:bg-emerald-600/30 text-xs font-black"><i className="fa-solid fa-gift mr-1"></i> Dar dias grátis</button>}

                                        <div className="flex-1"></div>
                                        <button onClick={() => alternarBloqueio(c)} disabled={busyId === c.id} className={`px-2.5 py-1.5 rounded-lg text-xs font-black border ${c.blocked ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30' : 'bg-rose-600/10 border-rose-500/30 text-rose-300 hover:bg-rose-600/20'}`}>
                                            <i className={`fa-solid ${c.blocked ? 'fa-unlock' : 'fa-ban'} mr-1`}></i>
                                            {c.blocked ? 'Reativar' : 'Suspender'}
                                        </button>
                                    </div>
                                )}
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
