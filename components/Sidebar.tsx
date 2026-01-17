
import React from 'react';
import { UserRole } from '../types';

interface SidebarProps {
  role: UserRole;
  activeTab: 'projects' | 'general' | 'users';
  setActiveTab: (tab: 'projects' | 'general' | 'users') => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, activeTab, setActiveTab, onLogout }) => {
  const NavItem = ({ id, icon, label }: { id: typeof activeTab; icon: string; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
        activeTab === id 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
          : 'text-slate-600 hover:bg-white hover:text-blue-600'
      }`}
    >
      <i className={`fa-solid ${icon} w-6`}></i>
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col p-4 shrink-0 hidden md:flex">
      <div className="flex items-center space-x-2 px-2 mb-10">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
          G
        </div>
        <span className="text-xl font-bold text-slate-800">ObraPro</span>
      </div>

      <nav className="flex-1 space-y-2">
        <NavItem id="projects" icon="fa-building" label="Obras" />
        <NavItem id="general" icon="fa-chart-pie" label="Geral" />
        {role === UserRole.ADMIN && <NavItem id="users" icon="fa-users" label="Usuários" />}
      </nav>

      <div className="pt-4 border-t border-slate-200">
        <button
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 text-red-500 rounded-xl hover:bg-red-50 transition"
        >
          <i className="fa-solid fa-right-from-bracket w-6"></i>
          <span className="font-medium">Sair</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
