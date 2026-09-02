import React, { useEffect, useState } from 'react';
import { Project, User, UserRole } from '../types';
import { supabase } from '../supabaseClient';
import { entitlementsFor } from '../hooks/useEntitlements';
import { useToast } from './ToastProvider';

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
  // false = entrou pelo apelido (conta de outra pessoa). Dá pra tirar da obra e
  // trocar o cargo, mas NÃO pra mexer na senha dele — a conta não é minha.
  meu?: boolean;
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
  myRoles: Record<string, string>; // projectId -> meu cargo naquela obra
}

const TeamManagement: React.FC<Props> = ({ projects, user, myRoles }) => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id do funcionário/obra em ação
  const [showForm, setShowForm] = useState(false);
  const [showApelido, setShowApelido] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set()); // cards de obras expandidos
  const toast = useToast();
  const toggleOpen = (id: string) => setOpenIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  // SÓ as obras em que eu sou o DONO. A tela mostrava todas as obras que a pessoa
  // enxerga — inclusive as dos outros, com os botões de cargo ligados — e clicar
  // numa dessas dava erro do banco (a regra members_* só deixa o dono mexer).
  // Botão que parece funcionar e não funciona é pior que botão que não existe.
  const obras = projects.filter(p => !p.archived && myRoles[p.id] === 'owner');

  // Teto de funcionários do plano (o dono da conta abre esta tela). Admin = sem teto.
  // A trava REAL é no servidor (team-actions); aqui é só o contador + travar o botão.
  const maxFunc = user.role === UserRole.ADMIN ? Infinity : entitlementsFor(user.plan).maxFuncionarios;
  const noTeto = team.length >= maxFunc;

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

  // Muda o cargo da pessoa numa obra: 'fora' tira, senão põe/atualiza.
  // PÔR alguém passa pelo servidor (team-actions), porque é lá que moram a trava
  // de plano e o teto de funcionários — inserir direto daqui deixava o "adicionar
  // pelo apelido" virar a porta dos fundos do plano. TIRAR continua direto: a
  // regra do banco já garante que só o dono tira, e tirar não gasta vaga nenhuma.
  const mudarCargo = async (member: TeamMember, projectId: string, alvo: Cargo | 'fora') => {
    const atual = member.memberships[projectId] as Cargo | undefined;
    if ((atual || 'fora') === alvo) return;
    setBusy(`${member.id}:${projectId}`);
    try {
      if (alvo === 'fora') {
        const { error } = await supabase.from('project_members').delete().match({ project_id: projectId, user_id: member.id });
        if (error) throw error;
      } else {
        await invokeTeam('add_to_project', { projectId, userId: member.id, role: alvo });
      }
      setTeam(prev => prev.map(m => {
        if (m.id !== member.id) return m;
        const nm = { ...m.memberships };
        if (alvo === 'fora') delete nm[projectId]; else nm[projectId] = alvo;
        return { ...m, memberships: nm };
      }));
    } catch (e: any) {
      toast.error('Não consegui mudar o acesso: ' + e.message);
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
          <p className="text-slate-400 text-sm">
            Cadastre quem trabalha nas suas obras e diga o que cada um pode.
            {Number.isFinite(maxFunc) && (
              <span className={`ml-1 font-bold ${noTeto ? 'text-amber-400' : 'text-slate-300'}`}>
                {team.length} de {maxFunc} funcionários.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowApelido(true)}
          disabled={obras.length === 0}
          title={obras.length === 0 ? 'Crie uma obra primeiro' : 'Dar acesso a quem já usa o ObraPro'}
          className="px-5 py-2.5 bg-slate-800 border border-slate-700 hover:border-blue-500 text-slate-100 rounded-2xl font-black text-sm flex items-center gap-2 shrink-0 transition-colors disabled:opacity-40"
        >
          <i className="fa-solid fa-user-check text-blue-400"></i> <span className="hidden sm:inline">Já usa o app</span>
        </button>
        <button
          onClick={() => setShowForm(true)}
          disabled={noTeto}
          title={noTeto ? `Limite de ${maxFunc} funcionários atingido` : undefined}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm flex items-center gap-2 shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600"
        >
          <i className="fa-solid fa-user-plus"></i> Novo funcionário
        </button>
      </div>

      {noTeto && (
        <div className="p-4 bg-amber-900/15 border border-amber-500/30 rounded-2xl text-amber-200 text-sm">
          Você chegou no limite de {maxFunc} funcionários do plano Construtora. Para cadastrar mais, fale com o suporte.
        </div>
      )}

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
                  <div className="text-xs text-slate-500">
                    entra com <b className="text-slate-300">{m.login}</b>
                    {m.meu === false && <span className="ml-2 text-[10px] uppercase tracking-wider bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded">conta própria</span>}
                  </div>
                </div>
              </div>
              {/* Só troca a senha de quem EU criei. Quem entrou pelo apelido tem
                  conta própria — dou e tiro acesso à obra, mas a senha é dele. */}
              {m.meu !== false && <button
                onClick={() => setResetId(resetId === m.id ? null : m.id)}
                className="text-xs font-bold text-slate-400 hover:text-white bg-slate-900/50 border border-slate-700 px-3 py-1.5 rounded-xl transition-colors shrink-0"
              >
                <i className="fa-solid fa-key text-[10px] mr-1"></i> Trocar senha
              </button>}
            </div>

            {resetId === m.id && (
              <ResetSenha member={m} onDone={() => setResetId(null)} />
            )}

            {/* Obras e cargo: card que EXPANDE (o Dono distribui as obras com calma) */}
            {(() => {
              const nObras = Object.keys(m.memberships).length;
              const aberto = openIds.has(m.id);
              return (
                <div className="mt-4">
                  <button
                    onClick={() => toggleOpen(m.id)}
                    className="w-full flex items-center justify-between gap-3 bg-slate-900/40 hover:bg-slate-900/70 rounded-2xl px-4 py-3 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
                      <i className="fa-solid fa-helmet-safety text-slate-500"></i>
                      Obras e cargo
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${nObras === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {nObras === 0 ? 'sem obra ainda' : `em ${nObras} obra${nObras > 1 ? 's' : ''}`}
                      </span>
                      <i className={`fa-solid fa-chevron-down text-slate-500 text-xs transition-transform ${aberto ? 'rotate-180' : ''}`}></i>
                    </span>
                  </button>

                  {aberto && (
                    <div className="mt-2 space-y-2">
                      {obras.length === 0 && (
                        <p className="text-xs text-amber-300 px-1">Crie uma obra primeiro para dar acesso a esta pessoa.</p>
                      )}
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
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {showForm && (
        <NovoFuncionario
          onClose={() => setShowForm(false)}
          onCriado={(id?: string) => {
            setShowForm(false);
            carregar();
            if (id) setOpenIds(prev => new Set(prev).add(id)); // já abre pra distribuir obras
          }}
        />
      )}

      {showApelido && (
        <AdicionarPeloApelido
          obras={obras}
          onClose={() => setShowApelido(false)}
          onAdicionado={(id: string) => {
            setShowApelido(false);
            carregar();
            setOpenIds(prev => new Set(prev).add(id));
          }}
        />
      )}
    </div>
  );
};

// ---- Dar acesso a quem JÁ USA o app, pelo apelido -----------------------------
// O Wender pediu isso em 28/08: "o Davidson está sem acesso à São Caetano, sem ter
// que cadastrar ele de novo". Antes, o único botão criava conta NOVA do zero — e a
// pessoa acabava com dois logins.
//
// O fluxo tem DOIS passos de propósito. Procurar não adiciona: primeiro o servidor
// devolve o NOME COMPLETO de quem tem aquele apelido, e só depois de você olhar o
// nome é que o acesso entra. O risco real aqui não é invasão, é errar uma letra do
// apelido e pôr um estranho dentro da obra — e o nome é o que segura isso.
const AdicionarPeloApelido: React.FC<{
  obras: Project[];
  onClose: () => void;
  onAdicionado: (id: string) => void;
}> = ({ obras, onClose, onAdicionado }) => {
  const [projectId, setProjectId] = useState(obras[0]?.id || '');
  const [login, setLogin] = useState('');
  const [cargo, setCargo] = useState<Cargo>('gestor');
  const [achado, setAchado] = useState<{ id: string; login: string; fullName: string; cargoAtual: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const toast = useToast();

  const obra = obras.find(o => o.id === projectId);

  const procurar = async () => {
    setErro(null); setAchado(null); setBusy(true);
    try {
      const data = await invokeTeam('find_by_login', { login: login.trim(), projectId });
      setAchado({ ...data.user, cargoAtual: data.cargoAtual });
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setBusy(false);
    }
  };

  const adicionar = async () => {
    if (!achado) return;
    setBusy(true);
    try {
      // Pelo servidor: além da regra do banco (só o dono da obra), é lá que valem
      // a trava de plano e o teto de funcionários.
      await invokeTeam('add_to_project', { projectId, userId: achado.id, role: cargo });
      toast.success(`${achado.fullName || achado.login} agora tem acesso a ${obra?.name} como ${CARGO_LABEL[cargo]}.`);
      onAdicionado(achado.id);
    } catch (e: any) {
      toast.error('Não consegui dar o acesso: ' + e.message);
      setBusy(false);
    }
  };

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h4 className="text-white font-black text-lg">Já usa o ObraPro</h4>
          <p className="text-slate-400 text-sm mt-1">
            Dê acesso a uma obra sua para quem já tem conta — sem criar login novo. Peça o <b>apelido</b> (o usuário de entrar) para a pessoa.
          </p>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Obra</label>
          <select value={projectId} onChange={e => { setProjectId(e.target.value); setAchado(null); }} className={inputCls}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Apelido da pessoa</label>
          <div className="flex gap-2">
            <input
              value={login}
              onChange={e => { setLogin(e.target.value); setAchado(null); setErro(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && login.trim() && !busy) procurar(); }}
              placeholder="ex.: davidson"
              autoFocus
              className={inputCls}
            />
            <button onClick={procurar} disabled={busy || !login.trim() || !projectId}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black text-sm shrink-0 disabled:opacity-40">
              {busy && !achado ? '…' : 'Procurar'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">Tem que ser o apelido exato — o app não lista nem adivinha nomes parecidos.</p>
        </div>

        {erro && <div className="p-3 bg-red-900/20 border border-red-500/40 rounded-xl text-red-200 text-sm">{erro}</div>}

        {achado && (
          <div className="p-4 bg-slate-800/60 border border-blue-500/40 rounded-2xl space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-500">Confira antes de dar o acesso</p>
              <p className="text-white font-black text-lg leading-tight mt-1">{achado.fullName || '(sem nome cadastrado)'}</p>
              <p className="text-slate-400 text-sm">apelido <b className="text-slate-200">{achado.login}</b></p>
            </div>
            {achado.cargoAtual ? (
              <p className="text-amber-300 text-sm">
                <i className="fa-solid fa-circle-info mr-1"></i>
                Essa pessoa já está em <b>{obra?.name}</b> como <b>{CARGO_LABEL[achado.cargoAtual as Cargo] || achado.cargoAtual}</b>. Para trocar o cargo, use a lista da equipe.
              </p>
            ) : (
              <>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Entra como</label>
                  <select value={cargo} onChange={e => setCargo(e.target.value as Cargo)} className={inputCls}>
                    <option value="gestor">Gestor — toca a obra toda</option>
                    <option value="apontador">Apontador — só lança despesa e avança a obra</option>
                  </select>
                </div>
                <button onClick={adicionar} disabled={busy}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-sm disabled:opacity-50">
                  {busy ? 'Dando acesso…' : `Dar acesso a ${obra?.name}`}
                </button>
              </>
            )}
          </div>
        )}

        <button onClick={onClose} className="w-full py-2 text-slate-400 hover:text-white text-sm">Fechar</button>
      </div>
    </div>
  );
};

// ---- Trocar a senha de um funcionário (inline) --------------------------------
const ResetSenha: React.FC<{ member: TeamMember; onDone: () => void }> = ({ member, onDone }) => {
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const salvar = async () => {
    if (senha.length < 6) { toast.error('A senha precisa de ao menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      await invokeTeam('set_member_password', { userId: member.id, password: senha });
      toast.success(`Senha de ${member.fullName || member.login} trocada. Passe a nova senha para a pessoa.`);
      onDone();
    } catch (e: any) {
      toast.error('Não consegui trocar a senha: ' + e.message);
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
// Só a CONTA: nome, login e senha. As obras e os cargos o Dono distribui depois,
// no card da equipe. Assim não precisa decidir tudo na hora do cadastro.
const NovoFuncionario: React.FC<{ onClose: () => void; onCriado: (id?: string) => void }> = ({ onClose, onCriado }) => {
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const toast = useToast();

  const salvar = async () => {
    setErro(null);
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(login.trim())) { setErro('Login inválido (letras, números, ponto, hífen ou _; mín. 3).'); return; }
    if (senha.length < 6) { setErro('A senha precisa de ao menos 6 caracteres.'); return; }
    setBusy(true);
    try {
      const pedido = login.trim();
      const data = await invokeTeam('create_member', { login: pedido, password: senha, fullName: nome.trim() });
      // O login precisa ser único; se o pedido já existia, o servidor achou um
      // livre (joao -> joao2). Avisa qual ficou pra o Dono passar certo.
      if (data?.login && String(data.login).toLowerCase() !== pedido.toLowerCase()) {
        toast.success(`O login "${pedido}" já existia. Criei como "${data.login}". A pessoa entra com "${data.login}".`);
      }
      onCriado(data?.id);
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
          <p className="text-[11px] text-slate-500">Depois de criar, você escolhe em quais obras a pessoa entra e o cargo em cada uma.</p>
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
