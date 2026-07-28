
import React from 'react';
import { UserRole } from '../types';
import { usePlan } from './PlanProvider';
import { planLabel } from '../hooks/useEntitlements';

interface SidebarProps {
  role: UserRole;
  activeTab: 'projects' | 'general' | 'users' | 'audit' | 'owner' | 'export' | 'team';
  setActiveTab: (tab: 'projects' | 'general' | 'users' | 'audit' | 'owner' | 'export' | 'team') => void;
  onLogout: () => void;
  onTriggerAI?: () => void;
}

// Barra lateral (desktop) = TRILHO DE ÍCONES sempre visível. Recolhida mostra só
// os ícones (w-16); ao passar o mouse ela abre (w-64) e revela os nomes. O rótulo
// e os textos só "acendem" no hover (opacity), o ícone fica sempre à mostra. O
// conteúdo reserva 64px à esquerda (main md:pl-16) pra não ficar embaixo do trilho.
const Sidebar: React.FC<SidebarProps> = ({ role, activeTab, setActiveTab, onLogout }) => {
  const { ent, openUpgrade } = usePlan();
  const NavItem = ({ id, icon, label }: { id: typeof activeTab; icon: string; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      title={label}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${activeTab === id
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
    >
      <i className={`fa-solid ${icon} text-lg w-6 text-center shrink-0`}></i>
      <span className="font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">{label}</span>
    </button>
  );

  return (
    <aside className="fixed left-0 top-0 h-full z-50 bg-slate-900 border-r border-slate-800 flex-col transition-all duration-300 ease-in-out w-16 hover:w-64 overflow-hidden group hidden md:flex hover:shadow-2xl">
      <div className="flex flex-col h-full p-2">
        {/* Logo (sempre visível; o nome acende no hover) */}
        <div className="flex items-center gap-2 px-1 h-14 mb-4 shrink-0">
          <img src="/pwa-192x192.png" alt="ObraPro" className="w-10 h-10 rounded-xl shrink-0 shadow-lg shadow-blue-500/20" />
          <span className="text-xl font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">ObraPro</span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem id="general" icon="fa-home" label="Início" />
          <NavItem id="audit" icon="fa-fingerprint" label="Auditoria" />
          {/* Equipe: só no Construtora (canUseMultiusuario). O Dono cadastra os
              funcionários e o que cada um pode. Funcionário tem plano free → não vê. */}
          {ent.canUseMultiusuario && <NavItem id="team" icon="fa-user-group" label="Equipe" />}
          {/* Portabilidade: qualquer cliente baixa os próprios dados quando quiser. */}
          <NavItem id="export" icon="fa-download" label="Meus dados" />
          {role === UserRole.ADMIN && <NavItem id="users" icon="fa-users" label="Usuários" />}
          {/* Painel do DONO DO APP (o negócio) — só o admin vê. Não confundir com
              "Usuários", que é o dono da obra liberando obra pra equipe dele. */}
          {role === UserRole.ADMIN && <NavItem id="owner" icon="fa-chart-line" label="Negócio" />}
        </nav>

        {/* Selo do plano. O dono do app (admin) não tem "plano de venda", então
            pra ele não mostramos nada; o cliente vê o nome do plano dele. O bloco
            de texto só acende no hover (recolhido = trilho de ícones). */}
        {role !== UserRole.ADMIN && (
          <div className="pt-4 border-t border-slate-800 space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center justify-between px-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                Seu plano
              </span>
              <span className={`text-xs font-black whitespace-nowrap ${ent.isFree ? 'text-slate-300' : 'text-blue-400'}`}>
                {planLabel(ent.plan)}
              </span>
            </div>
            {ent.isFree && (
              <button
                onClick={() => openUpgrade('geral')}
                className="w-full px-4 py-2.5 bg-amber-500/10 border border-amber-500/40 text-amber-400 rounded-xl font-black text-xs hover:bg-amber-500/20 transition whitespace-nowrap"
              >
                Conhecer os planos
              </button>
            )}
          </div>
        )}

        <div className="pt-4 mt-2 border-t border-slate-800">
          <button
            onClick={onLogout}
            title="Sair"
            className="w-full flex items-center gap-3 px-3 py-3 text-red-400 rounded-xl hover:bg-red-500/10 transition"
          >
            <i className="fa-solid fa-right-from-bracket text-lg w-6 text-center shrink-0"></i>
            <span className="font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">Sair</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
