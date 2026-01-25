import React from 'react';
import { UserRole } from '../types';
import VoiceAssistant from './VoiceAssistant';

interface MobileNavProps {
    role: UserRole;
    activeTab: 'projects' | 'general' | 'users' | 'audit';
    setActiveTab: (tab: 'projects' | 'general' | 'users' | 'audit') => void;
    onLogout: () => void;
    onNavigate: (tab: string) => void;
    onAction: (action: string, data?: any) => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ role, activeTab, setActiveTab, onLogout, onNavigate, onAction }) => {
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

            {/* Voice Assistant Embedded */}
            <VoiceAssistant
                isMobile={true}
                onNavigate={onNavigate}
                onAction={onAction}
            />

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
