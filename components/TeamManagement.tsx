import React, { useEffect, useState } from 'react';
import { Project, User } from '../types';
import { supabase } from '../supabaseClient';

// "Minha equipe" — a conta do DONO. Ele cria o funcionário (login + senha) e
// marca em quais das OBRAS dele a pessoa entra, com o cargo em cada uma.
//
// O que o banco NÃO deixa o navegador fazer (criar login, resetar senha, listar
// os perfis dos outros) passa pela edge function team-actions. O que o banco JÁ
// deixa o dono da obra fazer (add/tirar/trocar cargo de membro) é direto daqui —
// a regra members_insert/update/delete só aceita o owner da obra.

interface TeamMember {
  id: string;
  login: string;
  fullName: string;
  memberships: Record<string, string>; // projectId -> cargo ('gestor' | 'apontador')
}

type Cargo = 'gestor' | 'apontador';
const CARGO_LABEL: Record<Cargo, string> = { gestor: 'Gestor', apontador: 'Apontador' };

// Chama team-actions e devolve a mensagem AMIGÁVEL de erro (o motivo real vem no
// corpo JSON; sem isto o supabase-js mostra só "non-2xx status code").
async function invokeTeam(action: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('team-actions', { body: { action, ...args } });
  if (error) {
    let msg = error.message || String(error);
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* corpo não-JSON */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

interface Props {
  projects: Project[];
  user: User;
}

const TeamManagement: React.FC<Props> = ({ projects }) => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id do funcionário/obra em ação
  const [showForm, setShowForm] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);

  // Só as obras que o Dono pode gerenciar (hoje = as dele; passo 3 refina por cargo).
  const obras = projects.filter(p => !p.archived);

  const carregar = async () => {
    try {
      setLoading(true);
      const data = await invokeTeam('list_team');
      setTeam(data.team || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // Muda o cargo da pessoa numa obra: 'fora' tira, senão põe/atualiza. Direto no
  // banco (RLS members_*). Atualiza a tela na hora.
  const mudarCargo = async (member: TeamMember, projectId: string, alvo: Cargo | 'fora') => {
    const atual = member.memberships[projectId] as Cargo | undefined;
    if ((atual || 'fora') === alvo) return;
    setBusy(`${member.id}:${projectId}`);
    try {
      if (alvo === 'fora') {
        const { error } = await supabase.from('project_members').delete().match({ project_id: projectId, user_id: member.id });
        if (error) throw error;
      } else if (atual) {
        const { error } = await supabase.from('project_members').update({ role: alvo }).match({ project_id: projectId, user_id: member.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: member.id, role: alvo });
        if (error) throw error;
      }
      setTeam(prev => prev.map(m => {
        if (m.id !== member.id) return m;
        const nm = { ...m.memberships };
        if (alvo === 'fora') delete nm[projectId]; else nm[projectId] = alvo;
        return { ...m, memberships: nm };
      }));
    } catch (e: any) {
      alert('Não consegui mudar o acesso: ' + e.message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="p-8 text-slate-300">Carregando equipe…</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-24 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">Minha equipe 👷</h3>
          <p className="text-slate-400 text-sm">Cadastre quem trabalha nas suas obras e diga o que cada um pode.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm flex items-center gap-2 shrink-0 transition-colors"
        >
          <i className="fa-solid fa-user-plus"></i> Novo funcionário
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-500/40 rounded-2xl text-red-200 text-sm">{error}</div>
      )}

      {/* Legenda dos cargos */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <span><b className="text-emerald-400">Gestor</b> — toca a obra toda (não apaga a obra nem mexe na equipe).</span>
        <span><b className="text-blue-400">Apontador</b> — só lança despesa e avança a obra (não vê dinheiro nem sócios).</span>
      </div>

      {obras.length === 0 && (
        <div className="p-6 bg-amber-900/15 border border-amber-500/30 rounded-2xl text-amber-200 text-sm">
          Você ainda não tem obras. Crie uma obra primeiro para poder colocar sua equipe nela.
        </div>
      )}

      {team.length === 0 && obras.length > 0 && (
        <div className="p-8 text-center bg-slate-800/40 border border-slate-700/50 rounded-3xl text-slate-400">
          Nenhum funcionário ainda. Toque em <b className="text-white">Novo funcionário</b> para cadastrar o primeiro.
        </div>
      )}

      <div className="space-y-4">
        {team.map(m => (
          <div key={m.id} className="bg-slate-800/40 border border-slate-700/50 rounded-3xl p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-slate-700 text-slate-200 flex items-center justify-center font-black text-lg shrink-0">
                  {(m.fullName || m.login).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-black text-white">{m.fullName || m.login}</div>
                  <div className="text-xs text-slate-500">entra com <b className="text-slate-300">{m.login}</b></div>
                </div>
              </div>
              <button
                onClick={() => setResetId(resetId === m.id ? null : m.id)}
                className="text-xs font-bold text-slate-400 hover:text-white bg-slate-900/50 border border-slate-700 px-3 py-1.5 rounded-xl transition-colors shrink-0"
              >
                <i className="fa-solid fa-key text-[10px] mr-1"></i> Trocar senha
              </button>
            </div>

            {resetId === m.id && (
              <ResetSenha member={m} onDone={() => setResetId(null)} />
            )}

            {/* Obras: seletor Fora / Apontador / Gestor por obra */}
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Obras e cargo</p>
              {obras.map(p => {
                const atual = (m.memberships[p.id] as Cargo | undefined) || 'fora';
                const emAcao = busy === `${m.id}:${p.id}`;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 bg-slate-900/40 rounded-2xl px-4 py-2.5">
                    <span className="text-sm text-slate-200 font-bold truncate">{p.name}</span>
                    <div className={`flex gap-1 shrink-0 ${emAcao ? 'opacity-50 pointer-events-none' : ''}`}>
                      {(['fora', 'apontador', 'gestor'] as const).map(op => {
                        const on = atual === op;
                        const cor = op === 'fora'
                          ? (on ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300')
                          : op === 'apontador'
                          ? (on ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-blue-300')
                          : (on ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-emerald-300');
                        return (
                          <button
                            key={op}
                            onClick={() => mudarCargo(m, p.id, op)}
                            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${cor}`}
                          >
                            {op === 'fora' ? 'Não entra' : CARGO_LABEL[op as Cargo]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <NovoFuncionario
          obras={obras}
          onClose={() => setShowForm(false)}
          onCriado={() => { setShowForm(false); carregar(); }}
        />
      )}
    </div>
  );
};

// ---- Trocar a senha de um funcionário (inline) --------------------------------
const ResetSenha: React.FC<{ member: TeamMember; onDone: () => void }> = ({ member, onDone }) => {
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    if (senha.length < 6) { alert('A senha precisa de ao menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      await invokeTeam('set_member_password', { userId: member.id, password: senha });
      alert(`Senha de ${member.fullName || member.login} trocada. Passe a nova senha para a pessoa.`);
      onDone();
    } catch (e: any) {
      alert('Não consegui trocar a senha: ' + e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex items-center gap-2 bg-slate-900/50 rounded-2xl p-3">
      <input
        type="text"
        value={senha}
        onChange={e => setSenha(e.target.value)}
        placeholder="Nova senha (mín. 6)"
        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
      />
      <button onClick={salvar} disabled={busy} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">
        {busy ? '…' : 'Salvar'}
      </button>
      <button onClick={onDone} className="px-3 py-2 text-slate-400 hover:text-white text-sm">Cancelar</button>
    </div>
  );
};

// ---- Cadastrar novo funcionário (modal) --------------------------------------
const NovoFuncionario: React.FC<{ obras: Project[]; onClose: () => void; onCriado: () => void }> = ({ obras, onClose, onCriado }) => {
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [projectId, setProjectId] = useState(obras[0]?.id || '');
  const [cargo, setCargo] = useState<Cargo>('apontador');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setErro(null);
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(login.trim())) { setErro('Login inválido (letras, números, ponto, hífen ou _; mín. 3).'); return; }
    if (senha.length < 6) { setErro('A senha precisa de ao menos 6 caracteres.'); return; }
    if (!projectId) { setErro('Escolha a obra.'); return; }
    setBusy(true);
    try {
      await invokeTeam('create_member', { login: login.trim(), password: senha, fullName: nome.trim(), projectId, cargo });
      onCriado();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Novo funcionário</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-6 space-y-4">
          {erro && <div className="p-3 bg-red-900/20 border border-red-500/40 rounded-xl text-red-200 text-sm">{erro}</div>}
          <Campo label="Nome (opcional)">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: João da Silva"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </Campo>
          <Campo label="Login (a pessoa entra com isto)">
            <input value={login} onChange={e => setLogin(e.target.value)} placeholder="ex.: joao"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </Campo>
          <Campo label="Senha (mín. 6 — você passa pra pessoa)">
            <input type="text" value={senha} onChange={e => setSenha(e.target.value)} placeholder="senha provisória"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500" />
          </Campo>
          <Campo label="Obra">
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500">
              {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Campo>
          <Campo label="Cargo nesta obra">
            <div className="flex gap-2">
              {(['apontador', 'gestor'] as Cargo[]).map(c => (
                <button key={c} onClick={() => setCargo(c)}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${cargo === c
                    ? (c === 'gestor' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')
                    : 'bg-slate-800 border border-slate-700 text-slate-400'}`}>
                  {CARGO_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {cargo === 'gestor' ? 'Toca a obra toda; não apaga a obra nem mexe na equipe.' : 'Só lança despesa e avança a obra; não vê dinheiro nem sócios.'}
            </p>
          </Campo>
          <button onClick={salvar} disabled={busy}
            className="w-full mt-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm disabled:opacity-50">
            {busy ? 'Criando…' : 'Criar funcionário'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Campo: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
    {children}
  </div>
);

export default TeamManagement;
