import React, { useState, useRef, useEffect } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const SyncStatus: React.FC = () => {
    const isOnline = useOnlineStatus();
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Count mutations that are actively running (not paused)
    const activeMutations = useIsMutating({
        predicate: (mutation) => mutation.state.status === 'pending' && !mutation.state.isPaused
    });

    // Count mutations that are paused (waiting for network)
    const pausedMutations = useIsMutating({
        predicate: (mutation) => mutation.state.status === 'pending' && mutation.state.isPaused
    });

    const mutations = queryClient.getMutationCache().getAll();
    const pending = mutations.filter(m => m.state.status === 'pending');
    const stuckMutations = pending.filter(m => m.state.failureCount > 0);

    const handleClearQueue = () => {
        const shouldClear = window.confirm(
            `⚠️ Tem certeza que deseja LIMPAR a fila de sincronização?\n\nIsso removerá todas as alterações locais pendentes e elas não serão salvas no banco de dados.`
        );

        if (shouldClear) {
            queryClient.getMutationCache().clear();
            setIsOpen(false);
            alert('Fila limpa com sucesso. Atualizando...');
            window.location.reload();
        }
    };

    const handleForceSync = () => {
        console.log('[SyncStatus] Forcing sync - resuming ALL pending mutations');
        
        // 1. Resume paused mutations
        queryClient.resumePausedMutations();
        
        // 2. Also force-retry stuck mutations that aren't paused but have failures
        if (stuckMutations.length > 0) {
            stuckMutations.forEach(m => {
                m.state.failureCount = 0;
                m.state.failureReason = null;
            });
            queryClient.resumePausedMutations();
        }
        
        alert(`Sincronização forçada! Tentando reenviar itens pendentes...`);
    };

    // Determine state
    let statusType: 'offline' | 'pending' | 'syncing' | 'synced' = 'synced';
    if (!isOnline) {
        statusType = 'offline';
    } else if (pausedMutations > 0 || stuckMutations.length > 0) {
        statusType = 'pending';
    } else if (activeMutations > 0) {
        statusType = 'syncing';
    }

    return (
        <div ref={containerRef} className="relative z-50">
            {/* Sleek Interactive Badge */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full border transition-all duration-300 pointer-events-auto backdrop-blur-md active:scale-95 shadow-md ${
                    statusType === 'offline'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                        : statusType === 'pending'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                        : statusType === 'syncing'
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                        : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 opacity-80 hover:opacity-100'
                }`}
            >
                {/* Breathing Status Light or Icon */}
                {statusType === 'offline' && (
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                )}
                {statusType === 'pending' && (
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                )}
                {statusType === 'syncing' && (
                    <i className="fa-solid fa-arrows-rotate fa-spin text-[10px] text-yellow-400"></i>
                )}
                {statusType === 'synced' && (
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                )}

                {/* Badge text */}
                <span className="text-[11px] font-black uppercase tracking-wider leading-none">
                    {statusType === 'offline' && `Offline ${pausedMutations > 0 ? `(${pausedMutations})` : ''}`}
                    {statusType === 'pending' && `${pending.length} Pendente${pending.length > 1 ? 's' : ''}`}
                    {statusType === 'syncing' && 'Salvando'}
                    {statusType === 'synced' && 'Salvo'}
                </span>

                <i className={`fa-solid fa-chevron-down text-[8px] opacity-60 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {/* Premium Glassmorphic Popover Control Panel */}
            {isOpen && (
                <div className="absolute top-11 left-0 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-5 z-[999] animate-fade-in text-left pointer-events-auto">
                    {/* Popover Header */}
                    <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <i className="fa-solid fa-cloud-arrow-up text-blue-400 text-sm"></i>
                            Sincronização
                        </h4>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                            isOnline 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>

                    {/* Popover Content */}
                    <div className="space-y-4">
                        {/* Status Message */}
                        <div>
                            {statusType === 'offline' && (
                                <div className="space-y-2">
                                    <p className="text-sm font-bold text-white flex items-center gap-2">
                                        <i className="fa-solid fa-cloud-slash text-red-400"></i>
                                        Sem Conexão
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Você está trabalhando offline. Suas alterações foram salvas com segurança no seu dispositivo e serão enviadas automaticamente para a nuvem assim que você se reconectar à internet.
                                    </p>
                                </div>
                            )}

                            {statusType === 'pending' && (
                                <div className="space-y-2">
                                    <p className="text-sm font-bold text-white flex items-center gap-2">
                                        <i className="fa-solid fa-triangle-exclamation text-amber-400"></i>
                                        Alterações Pendentes
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Existem **{pending.length}** operações locais aguardando envio para o servidor. Se a conexão estiver instável, você pode forçar o reenvio manual dos dados.
                                    </p>
                                </div>
                            )}

                            {statusType === 'syncing' && (
                                <div className="space-y-2">
                                    <p className="text-sm font-bold text-white flex items-center gap-2">
                                        <i className="fa-solid fa-arrows-rotate fa-spin text-yellow-400"></i>
                                        Salvando na Nuvem
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        O ObraPro está atualmente sincronizando seus novos registros com o servidor remoto. Por favor, aguarde alguns instantes.
                                    </p>
                                </div>
                            )}

                            {statusType === 'synced' && (
                                <div className="space-y-2">
                                    <p className="text-sm font-bold text-white flex items-center gap-2">
                                        <i className="fa-solid fa-circle-check text-emerald-400"></i>
                                        Tudo Atualizado
                                    </p>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Todos os diários de obra, lançamentos de despesas e novos dados estão salvos e sincronizados perfeitamente na nuvem!
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Queue Details */}
                        {pending.length > 0 && (
                            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 max-h-36 overflow-y-auto space-y-2">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Lista de Envios ({pending.length})</p>
                                {pending.map((m, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-[10px] text-slate-300 bg-slate-900/40 p-1.5 rounded border border-slate-800">
                                        <span className="font-bold truncate max-w-[160px]">
                                            {m.options.mutationKey?.join(' • ') || 'Operação local'}
                                        </span>
                                        <span className={`px-1.5 py-0.2 rounded font-semibold text-[8px] uppercase ${
                                            m.state.isPaused 
                                                ? 'bg-amber-500/10 text-amber-400' 
                                                : m.state.failureCount > 0 
                                                ? 'bg-red-500/15 text-red-400' 
                                                : 'bg-blue-500/10 text-blue-400 animate-pulse'
                                        }`}>
                                            {m.state.isPaused 
                                                ? 'Pausado' 
                                                : m.state.failureCount > 0 
                                                ? `Erro (x${m.state.failureCount})` 
                                                : 'Enviando'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Interactive Buttons */}
                        <div className="pt-2 flex flex-col gap-2">
                            {pending.length > 0 && (
                                <button
                                    onClick={handleForceSync}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-98 flex items-center justify-center gap-2"
                                >
                                    <i className="fa-solid fa-cloud-arrow-up"></i>
                                    Sincronizar Agora
                                </button>
                            )}

                            {pending.length > 0 && (
                                <button
                                    onClick={handleClearQueue}
                                    className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold text-xs py-2 px-4 rounded-xl transition-all active:scale-98 flex items-center justify-center gap-2"
                                >
                                    <i className="fa-solid fa-trash-can"></i>
                                    Limpar Fila de Envio
                                </button>
                            )}

                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2 px-4 rounded-xl transition-all active:scale-98 flex items-center justify-center"
                            >
                                Fechar painel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
