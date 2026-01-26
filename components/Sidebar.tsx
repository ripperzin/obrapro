
import React from 'react';
import { UserRole } from '../types';

interface SidebarProps {
  role: UserRole;
  activeTab: 'projects' | 'general' | 'users' | 'audit';
  setActiveTab: (tab: 'projects' | 'general' | 'users' | 'audit') => void;
  onLogout: () => void;
  onTriggerAI: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, activeTab, setActiveTab, onLogout, onTriggerAI }) => {
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
          {role === UserRole.ADMIN && <NavItem id="users" icon="fa-users" label="Usuários" />}

          <button
            onClick={onTriggerAI}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-indigo-400" fill="currentColor">
              <path d="M12 3L14.5 8.5L20 11L14.5 13.5L12 19L9.5 13.5L4 11L9.5 8.5L12 3Z" />
              <path d="M19 3L20 5.5L22.5 6.5L20 7.5L19 10L18 7.5L15.5 6.5L18 5.5L19 3Z" />
              <path d="M5 14L6 16.5L8.5 17.5L6 18.5L5 21L4 18.5L1.5 17.5L4 16.5L5 14Z" />
            </svg>
            <span className="font-bold text-lg">Copiloto IA</span>
          </button>
        </nav>

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
