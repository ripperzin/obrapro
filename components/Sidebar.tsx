
import React from 'react';
import { UserRole } from '../types';
import { usePlan } from './PlanProvider';
import { planLabel } from '../hooks/useEntitlements';

interface SidebarProps {
  role: UserRole;
  activeTab: 'projects' | 'general' | 'users' | 'audit' | 'owner' | 'export';
  setActiveTab: (tab: 'projects' | 'general' | 'users' | 'audit' | 'owner' | 'export') => void;
  onLogout: () => void;
  onTriggerAI?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, activeTab, setActiveTab, onLogout }) => {
  const { ent, openUpgrade } = usePlan();
  const NavItem = ({ id, icon, label }: { id: typeof activeTab; icon: string; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeTab === id
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
    >
      <i className={`fa-solid ${icon} w-6`}></i>
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <aside className="fixed left-0 top-0 h-full z-50 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out w-4 hover:w-64 overflow-hidden group hidden md:flex hover:shadow-2xl">
      {/* Strip Visual Indicator (Always visible when collapsed) */}
      <div className="absolute left-0 top-0 w-4 h-full bg-slate-800/30 flex flex-col items-center pt-10 gap-2 opacity-100 group-hover:opacity-0 transition-opacity duration-300">
        <div className="w-[2px] h-full bg-slate-700/50 rounded-full"></div>
      </div>

      {/* Main Content (Hidden when collapsed) */}
      <div className="w-64 flex flex-col h-full p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75">
        <div className="flex items-center space-x-2 px-2 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30">
            G
          </div>
          <span className="text-xl font-bold text-white whitespace-nowrap">ObraPro</span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem id="general" icon="fa-home" label="Início" />
          <NavItem id="audit" icon="fa-fingerprint" label="Auditoria" />
          {/* Portabilidade: qualquer cliente baixa os próprios dados quando quiser. */}
          <NavItem id="export" icon="fa-download" label="Meus dados" />
          {role === UserRole.ADMIN && <NavItem id="users" icon="fa-users" label="Usuários" />}
          {/* Painel do DONO DO APP (o negócio) — só o admin vê. Não confundir com
              "Usuários", que é o dono da obra liberando obra pra equipe dele. */}
          {role === UserRole.ADMIN && <NavItem id="owner" icon="fa-chart-line" label="Negócio" />}
        </nav>

        {/* Selo do plano. 'business' é etiqueta interna (admin), não um plano
            de venda — nesse caso não mostra nada em vez de escrever "Business". */}
        {ent.plan !== 'business' && (
          <div className="pt-4 border-t border-slate-800 space-y-2">
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
                Conhecer o ObraPro
              </button>
            )}
          </div>
        )}

        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 rounded-xl hover:bg-red-500/10 transition whitespace-nowrap"
          >
            <i className="fa-solid fa-right-from-bracket w-6"></i>
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
