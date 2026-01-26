import React from 'react';
import { UserRole } from '../types';
interface MobileNavProps {
    role: UserRole;
    activeTab: 'projects' | 'general' | 'users' | 'audit';
    setActiveTab: (tab: 'projects' | 'general' | 'users' | 'audit') => void;
    onLogout: () => void;
    onTriggerAI: () => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ role, activeTab, setActiveTab, onLogout, onTriggerAI }) => {
    const NavItem = ({ id, icon, label }: { id: typeof activeTab; icon: string; label: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center justify-center space-y-1 p-2 rounded-xl transition-all ${activeTab === id
                ? 'text-blue-400'
                : 'text-slate-500 hover:text-blue-400'
                }`}
        >
            <div className={`p-2 rounded-full ${activeTab === id ? 'bg-blue-500/20' : 'bg-transparent'
                }`}>
                <i className={`fa-solid ${icon} text-lg`}></i>
            </div>
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    );

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 px-6 py-2 flex justify-around items-center z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            <NavItem id="general" icon="fa-home" label="Início" />
            <NavItem id="audit" icon="fa-fingerprint" label="Auditoria" />

            <div className="relative -top-4"> {/* Reduced lift for better mobile compatibility */}
                <button
                    onClick={onTriggerAI}
                    className="group relative w-16 h-16 rounded-full flex flex-col items-center justify-center transition-all duration-300 
                               bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-400
                               shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5),inset_0_2px_4px_rgba(255,255,255,0.3),inset_0_-4px_6px_rgba(0,0,0,0.2)]
                               hover:scale-105 active:scale-95 active:translate-y-1
                               border border-indigo-400/30"
                >
                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>

                    <svg viewBox="0 0 24 24" className="w-7 h-7 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-10" fill="currentColor">
                        <path d="M12 3L14.5 8.5L20 11L14.5 13.5L12 19L9.5 13.5L4 11L9.5 8.5L12 3Z" className="animate-pulse" />
                        <path d="M19 3L20 5.5L22.5 6.5L20 7.5L19 10L18 7.5L15.5 6.5L18 5.5L19 3Z" />
                        <path d="M5 14L6 16.5L8.5 17.5L6 18.5L5 21L4 18.5L1.5 17.5L4 16.5L5 14Z" />
                    </svg>

                    {/* Pulse Ring */}
                    <div className="absolute inset-0 rounded-full animate-ping bg-indigo-500/20 pointer-events-none"></div>
                </button>
            </div>

            {role === UserRole.ADMIN && (
                <NavItem id="users" icon="fa-users" label="Usuários" />
            )}

            <button
                onClick={onLogout}
                className="flex flex-col items-center justify-center space-y-1 p-2 text-slate-500 hover:text-red-400 transition-colors"
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
