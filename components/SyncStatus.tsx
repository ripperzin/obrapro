import React from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const SyncStatus: React.FC = () => {
    const isOnline = useOnlineStatus();
    const queryClient = useQueryClient();

    // Count mutations that are actively running (not paused)
    const activeMutations = useIsMutating({
        predicate: (mutation) => mutation.state.status === 'pending' && !mutation.state.isPaused
    });

    // Count mutations that are paused (waiting for network)
    const pausedMutations = useIsMutating({
        predicate: (mutation) => mutation.state.status === 'pending' && mutation.state.isPaused
    });

    const handleDebugClick = () => {
        const mutations = queryClient.getMutationCache().getAll();
        const pending = mutations.filter(m => m.state.status === 'pending');
        const paused = pending.filter(m => m.state.isPaused);

        let debugInfo = `=== STATUS DE SINCRONIZAÇÃO ===\n`;
        debugInfo += `Online: ${isOnline ? 'Sim' : 'Não'}\n`;
        debugInfo += `Mutations ativas: ${activeMutations}\n`;
        debugInfo += `Mutations pausadas: ${paused.length}\n\n`;

        if (pending.length > 0) {
            debugInfo += `=== DETALHES ===\n`;
            pending.forEach((m, i) => {
                debugInfo += `\n[${i + 1}] ${m.options.mutationKey?.join('/') || 'unknown'}\n`;
                debugInfo += `  Status: ${m.state.status}\n`;
                debugInfo += `  Pausado: ${m.state.isPaused ? 'Sim' : 'Não'}\n`;
                debugInfo += `  Tentativas: ${m.state.failureCount}\n`;
                if (m.state.failureReason) {
                    debugInfo += `  Erro: ${JSON.stringify(m.state.failureReason)}\n`;
                }
            });
        }

        const shouldClear = window.confirm(
            `${debugInfo}\n\n⚠️ Deseja LIMPAR a fila de sincronização?\n(Dados não salvos serão perdidos)`
        );

        if (shouldClear) {
            queryClient.getMutationCache().clear();
            alert('Fila limpa. Recarregando página...');
            window.location.reload();
        }
    };

    const handleForceSync = () => {
        console.log('[SyncStatus] Forcing sync - resuming paused mutations');
        queryClient.resumePausedMutations();
    };

    // Offline indicator
    if (!isOnline) {
        return (
            <div
                onClick={handleDebugClick}
                className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all hover:bg-red-500/20"
                title="Sem conexão - alterações serão sincronizadas quando reconectar"
            >
                <i className="fa-solid fa-cloud-slash text-red-500 text-xs"></i>
                <span className="text-red-500 text-xs font-semibold">
                    Offline {pausedMutations > 0 && `(${pausedMutations})`}
                </span>
            </div>
        );
    }

    // Has paused mutations waiting to sync
    if (pausedMutations > 0) {
        return (
            <div className="flex items-center gap-1">
                <div
                    onClick={handleForceSync}
                    className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all hover:bg-orange-500/20"
                    title="Clique para forçar sincronização"
                >
                    <i className="fa-solid fa-cloud-arrow-up text-orange-500 text-xs animate-pulse"></i>
                    <span className="text-orange-500 text-xs font-semibold">
                        {pausedMutations} pendente{pausedMutations > 1 ? 's' : ''}
                    </span>
                </div>
                <button
                    onClick={handleDebugClick}
                    className="p-1.5 text-orange-500/60 hover:text-orange-500 transition-colors"
                    title="Ver detalhes"
                >
                    <i className="fa-solid fa-circle-info text-xs"></i>
                </button>
            </div>
        );
    }

    // Actively syncing
    if (activeMutations > 0) {
        // Check for repeated failures
        const mutations = queryClient.getMutationCache().getAll();
        const failingMutation = mutations.find(m => m.state.status === 'pending' && m.state.failureCount > 2);

        if (failingMutation) {
            return (
                <div
                    onClick={handleDebugClick}
                    className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all hover:bg-orange-500/20"
                    title="Clique para ver detalhes do erro"
                >
                    <i className="fa-solid fa-wifi text-orange-500 text-xs animate-pulse"></i>
                    <span className="text-orange-500 text-xs font-semibold">Reconectando...</span>
                </div>
            );
        }

        return (
            <div
                onClick={handleDebugClick}
                className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all hover:bg-yellow-500/20"
                title="Salvando alterações..."
            >
                <i className="fa-solid fa-arrows-rotate fa-spin text-yellow-500 text-xs"></i>
                <span className="text-yellow-500 text-xs font-semibold">Salvando...</span>
            </div>
        );
    }

    // All synced
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all opacity-70 hover:opacity-100">
            <i className="fa-solid fa-cloud-check text-green-500 text-xs"></i>
            <span className="text-green-500 text-xs font-semibold">Salvo</span>
        </div>
    );
};
