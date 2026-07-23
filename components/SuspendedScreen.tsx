import React from 'react';
import { Project, User } from '../types';
import DataExportPanel from './DataExportPanel';

interface Props {
    projects: Project[];
    user: User;
    onLogout: () => void;
}

/**
 * Tela de CONTA SUSPENSA. Em vez de expulsar o cliente na porta, ele cai aqui:
 * não usa mais o app, mas pode BAIXAR tudo que é dele (portabilidade/LGPD) e ver
 * como reativar. A sessão segue viva só pra exportação ler os dados.
 */
const SuspendedScreen: React.FC<Props> = ({ projects, user, onLogout }) => {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
                <div className="glass rounded-3xl border border-amber-500/40 p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center text-xl shrink-0">
                            <i className="fa-solid fa-lock"></i>
                        </div>
                        <div>
                            <h1 className="text-xl font-black">Sua conta está suspensa</h1>
                            <p className="text-sm text-slate-400">Os seus dados continuam guardados e são seus.</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                        O acesso ao app foi pausado. Para reativar, fale com o ObraPro pelo WhatsApp{' '}
                        <a href="https://wa.me/5599999999999" className="text-emerald-400 font-bold underline">suporte</a>{' '}
                        ou responda o e-mail da sua assinatura. Enquanto isso, você pode <b>baixar tudo o que é seu</b> aqui embaixo.
                    </p>
                </div>

                <div>
                    <h2 className="text-white font-black text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                        <i className="fa-solid fa-download text-blue-400"></i> Baixar meus dados
                    </h2>
                    <DataExportPanel projects={projects} user={user} />
                </div>

                <div className="text-center pt-2">
                    <button onClick={onLogout} className="text-slate-500 hover:text-white text-sm font-bold">
                        <i className="fa-solid fa-arrow-right-from-bracket mr-1.5"></i> Sair
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SuspendedScreen;
