
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

interface LoginPageProps {
  onLoginSuccess: (session: any) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const loginEmail = email.includes('@') ? email : `${email}@obrapro.com`;

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

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);

    const loginEmail = email.includes('@') ? email : `${email}@obrapro.com`;

    const { data, error } = await supabase.auth.signUp({
      email: loginEmail,
      password: pass,
    });

    if (error) {
      setError(error.message);
    } else {
      alert('Cadastro realizado! Você já pode tentar logar.');
    }
    setLoading(false);
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
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-blue-500/20">
            G
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gestão Obra Pro</h1>
          <p className="text-slate-400 text-sm mt-2">Faça login para gerenciar seus empreendimentos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Login / E-mail</label>
            <div className="relative">
              <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input
                required
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
            {loading ? 'Carregando...' : 'Acessar Sistema'}
          </button>

          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full py-2 text-slate-400 hover:text-white text-xs font-bold transition"
          >
            Criar conta
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
