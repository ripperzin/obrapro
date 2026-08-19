
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useToast } from './ToastProvider';

interface LoginPageProps {
  onLoginSuccess: (session: any) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duas telas no mesmo lugar: entrar e criar conta. O cadastro pede APELIDO
  // separado do e-mail de propósito — o apelido é o que a pessoa vai digitar
  // todo dia no celular, e derivar do e-mail dá resultado ruim (um
  // financeiro@construtora.com.br viraria o login "financeiro", que colide com
  // o próximo cliente igual).
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [emailNovo, setEmailNovo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const entrada = email.trim();
    let loginEmail = entrada;

    // Sem "@" = a pessoa digitou o LOGIN (apelido). Achamos o e-mail dela pelo
    // login (função email_for_login, chamável antes de estar logado).
    if (!entrada.includes('@')) {
      const { data: achado, error: rpcErr } = await supabase.rpc('email_for_login', { p_login: entrada });
      if (rpcErr) {
        setError('Não consegui verificar o login. Tente novamente.');
        setLoading(false);
        return;
      }
      if (!achado) {
        setError('Login não encontrado. Confira o login ou use o e-mail.');
        setLoading(false);
        return;
      }
      loginEmail = achado as string;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: pass,
    });

    if (error) {
      setError(error.message);
    } else {
      onLoginSuccess(data.session);
    }
    setLoading(false);
  };

  // Criar conta. Vai pela função `signup` do servidor (e não pelo cadastro
  // comum) por dois motivos: o apelido é validado ANTES da conta nascer — a
  // pessoa recebe "esse apelido já existe" em vez de virar "joao2" sem saber —
  // e a conta já nasce valendo, sem depender de e-mail de confirmação chegar.
  // Antes daqui, o cadastro criava a conta e a pessoa NUNCA conseguia entrar.
  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('signup', {
        body: { login: apelido.trim(), email: emailNovo.trim(), password: pass, fullName: nome.trim() },
      });
      // A função responde o erro no corpo (400), então olhamos os dois lugares.
      const msg = (data as { error?: string } | null)?.error || (fnErr ? 'Não consegui falar com o servidor. Confira sua internet.' : null);
      if (msg) { setError(msg); setLoading(false); return; }

      // Deu certo: já entra, em vez de mandar a pessoa digitar tudo de novo.
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: emailNovo.trim().toLowerCase(),
        password: pass,
      });
      if (loginErr) {
        toast.success(`Conta criada! Entre com o apelido ${apelido.trim()}.`);
        setModo('entrar');
        setEmail(apelido.trim());
      } else {
        toast.success(`Bem-vindo! Seu login é ${apelido.trim()}.`);
      }
    } catch (e: any) {
      setError(e?.message || 'Não consegui criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6 relative overflow-hidden">
      {/* Decorative patterns */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-800 rounded-full blur-[120px]"></div>
      </div>

      <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          <img
            src="/apple-touch-icon.png"
            alt="Obra Pro Logo"
            className="w-16 h-16 rounded-2xl mx-auto mb-4 shadow-lg shadow-blue-500/20 object-cover"
          />
          <h1 className="text-2xl font-bold text-white tracking-tight">Obra Pro</h1>
          <p className="text-slate-400 text-sm mt-2">{modo === 'criar' ? 'Crie sua conta e comece a controlar sua obra' : 'Faça login para gerenciar seus empreendimentos'}</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (modo === 'criar') { handleSignUp(); } else { handleSubmit(e); } }} className="space-y-5">
          {modo === 'criar' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Seu nome</label>
                <div className="relative">
                  <i className="fa-solid fa-id-card absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                  <input
                    type="text"
                    className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500 transition shadow-sm placeholder-slate-400 font-bold"
                    placeholder="Ex: Victor Ávila"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Apelido para entrar</label>
                <div className="relative">
                  <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                  <input
                    required
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500 transition shadow-sm placeholder-slate-400 font-bold"
                    placeholder="Ex: victoravila"
                    value={apelido}
                    onChange={e => setApelido(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-slate-500 px-1">É o que você vai digitar pra entrar, todo dia. Sem espaço e sem acento.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">E-mail</label>
                <div className="relative">
                  <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                  <input
                    required
                    type="email"
                    autoCapitalize="none"
                    className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500 transition shadow-sm placeholder-slate-400 font-bold"
                    placeholder="seu@email.com"
                    value={emailNovo}
                    onChange={e => setEmailNovo(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-slate-500 px-1">Só pra recuperar a conta e falar com você. Não some no seu dia a dia.</p>
              </div>
            </>
          )}

          <div className={`space-y-2 ${modo === 'criar' ? 'hidden' : ''}`}>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Login / E-mail</label>
            <div className="relative">
              <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input
                required={modo === 'entrar'}
                type="text"
                className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500 transition shadow-sm placeholder-slate-400 font-bold"
                placeholder="Ex: victoravila"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Senha</label>
            <div className="relative">
              <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input
                required
                type="password"
                className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-800 outline-none focus:border-blue-500 transition shadow-sm placeholder-slate-400 font-bold"
                placeholder="••••••••"
                value={pass}
                onChange={e => setPass(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition shadow-lg shadow-blue-500/20 mt-4 active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Carregando...' : modo === 'criar' ? 'Criar minha conta' : 'Acessar Sistema'}
          </button>

          <button
            type="button"
            onClick={() => { setModo(modo === 'criar' ? 'entrar' : 'criar'); setError(null); }}
            disabled={loading}
            className="w-full py-2 text-slate-400 hover:text-white text-xs font-bold transition"
          >
            {modo === 'criar' ? 'Já tenho conta — entrar' : 'Criar conta'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Controle de Auditoria Ativo</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
