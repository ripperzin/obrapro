import React from 'react';
import { UserRole } from '../types';
import { usePlan } from './PlanProvider';
interface MobileNavProps {
    role: UserRole;
    activeTab: 'projects' | 'general' | 'users' | 'audit' | 'owner' | 'export' | 'team';
    setActiveTab: (tab: 'projects' | 'general' | 'users' | 'audit' | 'owner' | 'export' | 'team') => void;
    onLogout: () => void;
    onTriggerAI?: () => void;
    // Só convidado (está nas obras de outros): não assina plano, não vê "Meu plano".
    soConvidado?: boolean;
}

const MobileNav: React.FC<MobileNavProps> = ({ role, activeTab, setActiveTab, onLogout, soConvidado }) => {
    const { ent, openUpgrade } = usePlan();
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

            {/* Equipe: só no Construtora. */}
            {ent.canUseMultiusuario && (
                <NavItem id="team" icon="fa-user-group" label="Equipe" />
            )}

            {role === UserRole.ADMIN && (
                <NavItem id="users" icon="fa-users" label="Usuários" />
            )}

            {/* Só no Grátis: a barra de baixo tem pouco espaço, então o convite
                só ocupa um lugar aqui quando leva a algum lugar. Quem já paga
                (Completo/Construtora) não precisa do convite. */}
            {ent.isFree && !soConvidado && (
                <button
                    onClick={() => openUpgrade('geral')}
                    className="flex flex-col items-center justify-center space-y-1 p-2 text-amber-400 hover:text-amber-300 transition-colors"
                >
                    <div className="p-2 rounded-full bg-amber-500/10">
                        <i className="fa-solid fa-helmet-safety text-lg"></i>
                    </div>
                    <span className="text-[10px] font-bold">Meu plano</span>
                </button>
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
