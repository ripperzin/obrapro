import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '../types';
import { useToast } from './ToastProvider';

/**
 * "Minha conta" — por enquanto só o que faltava: trocar a PRÓPRIA senha.
 *
 * Antes disto, a senha de alguém só podia ser trocada pelo dono da obra (tela
 * Minha equipe). Ou seja: a senha do usuário nascia e morria no WhatsApp de
 * quem criou a conta. Serve entre conhecidos, não serve pra cliente.
 *
 * Pede a senha ATUAL antes de trocar de propósito: o app fica logado no celular
 * o tempo todo (é PWA, ninguém desloga), então sem essa conferência qualquer um
 * com o aparelho na mão trocaria a senha do dono e o tomaria da conta.
 */
const MinhaConta: React.FC<{ user: User }> = ({ user }) => {
    const toast = useToast();
    const [aberto, setAberto] = useState(false);
    const [atual, setAtual] = useState('');
    const [nova, setNova] = useState('');
    const [confirma, setConfirma] = useState('');
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const limpar = () => { setAtual(''); setNova(''); setConfirma(''); setErro(null); };

    const salvar = async () => {
        setErro(null);
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setErro('Sem internet: trocar a senha precisa de conexão. Tente quando o sinal voltar.');
            return;
        }
        if (nova.length < 6) { setErro('A nova senha precisa de ao menos 6 caracteres.'); return; }
        if (nova !== confirma) { setErro('A confirmação não bate com a nova senha.'); return; }
        if (nova === atual) { setErro('A nova senha é igual à atual.'); return; }

        setBusy(true);
        try {
            const { data: { user: contaAuth } } = await supabase.auth.getUser();
            const email = contaAuth?.email;
            if (!email) {
                setErro('Não consegui confirmar sua conta agora. Saia e entre de novo.');
                return;
            }
            // Confere a senha atual (ver o porquê no comentário do topo).
            const { error: confErr } = await supabase.auth.signInWithPassword({ email, password: atual });
            if (confErr) { setErro('A senha atual está errada.'); return; }

            const { error } = await supabase.auth.updateUser({ password: nova });
            if (error) { setErro(error.message); return; }

            toast.success('Senha trocada. Use a nova da próxima vez que entrar.');
            setAberto(false);
            limpar();
        } catch (e: any) {
            setErro(e?.message || 'Não consegui trocar a senha.');
        } finally {
            setBusy(false);
        }
    };

    const campo = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-emerald-500';
    const rotulo = 'text-[10px] font-black uppercase tracking-widest text-slate-500';

    return (
        <div className="glass rounded-2xl border border-slate-700 p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h4 className="text-white font-black">Minha conta</h4>
                    <p className="text-slate-400 text-xs mt-0.5">
                        Você entra com <b className="text-slate-200">{user.login}</b>
                    </p>
                </div>
                <button
                    onClick={() => { setAberto(!aberto); limpar(); }}
                    className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white text-xs font-black transition-colors"
                >
                    <i className="fa-solid fa-key text-[10px] mr-1.5"></i>
                    {aberto ? 'Cancelar' : 'Trocar minha senha'}
                </button>
            </div>

            {aberto && (
                <div className="mt-4 space-y-3">
                    {erro && (
                        <p className="text-rose-300 bg-rose-900/20 border border-rose-500/40 rounded-xl px-3 py-2 text-xs font-bold">{erro}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label className="block">
                            <span className={rotulo}>Senha atual</span>
                            <input type="password" autoComplete="current-password" className={`${campo} mt-1`}
                                value={atual} onChange={(e) => setAtual(e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={rotulo}>Nova senha</span>
                            <input type="password" autoComplete="new-password" placeholder="mín. 6" className={`${campo} mt-1`}
                                value={nova} onChange={(e) => setNova(e.target.value)} />
                        </label>
                        <label className="block">
                            <span className={rotulo}>Repita a nova</span>
                            <input type="password" autoComplete="new-password" className={`${campo} mt-1`}
                                value={confirma} onChange={(e) => setConfirma(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) salvar(); }} />
                        </label>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={salvar} disabled={busy}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-black text-sm flex items-center gap-2">
                            {busy ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                            {busy ? 'Trocando…' : 'Salvar nova senha'}
                        </button>
                        <p className="text-[11px] text-slate-500 leading-snug">
                            Você continua logado neste aparelho. A senha nova vale na próxima vez que entrar.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MinhaConta;
