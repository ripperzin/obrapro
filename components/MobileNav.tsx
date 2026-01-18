import React from 'react';
import { UserRole } from '../types';

interface MobileNavProps {
    role: UserRole;
    activeTab: 'projects' | 'general' | 'users';
    setActiveTab: (tab: 'projects' | 'general' | 'users') => void;
    onLogout: () => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ role, activeTab, setActiveTab, onLogout }) => {
    const NavItem = ({ id, icon, label }: { id: typeof activeTab; icon: string; label: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center justify-center space-y-1 p-2 rounded-xl transition-all ${activeTab === id
                    ? 'text-blue-600'
                    : 'text-slate-400 hover:text-blue-500'
                }`}
        >
            <div className={`p-2 rounded-full ${activeTab === id ? 'bg-blue-100' : 'bg-transparent'
                }`}>
                <i className={`fa-solid ${icon} text-lg`}></i>
            </div>
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    );

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-2 flex justify-between items-center z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
            <NavItem id="projects" icon="fa-building" label="Obras" />
            <NavItem id="general" icon="fa-chart-pie" label="Geral" />

            {role === UserRole.ADMIN && (
                <NavItem id="users" icon="fa-users" label="Usuários" />
            )}

            <button
                onClick={onLogout}
                className="flex flex-col items-center justify-center space-y-1 p-2 text-slate-400 hover:text-red-500 transition-colors"
            >
                <div className="p-2">
                    <i className="fa-solid fa-right-from-bracket text-lg"></i>
                </div>
                <span className="text-[10px] font-bold">Sair</span>
            </button>
        </nav>
    );
};

export default MobileNav;
