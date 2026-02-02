import React from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const SyncStatus: React.FC = () => {
    const isOnline = useOnlineStatus();
    // Only count mutations that are actually running (fetching), not paused ones
    const isMutating = useIsMutating({ status: 'pending' }); // 'pending' usually involves active network request or retry delay? 
    // Wait, useIsMutating() returns distinct count.
    // If a mutation is PAUSED, its status is 'pending' but isPaused is true?
    // Let's use filter.
    const activeMutations = useIsMutating({
        predicate: (mutation) => mutation.state.status === 'pending' && !mutation.state.isPaused
    });

    // Debug: Find the first failing mutation to show its error
    const queryClient = React.useContext(React.createContext(null)) as any || window['queryClient'];

    // We need access to the QueryCache/MutationCache
    // properly implemented: useQueryClient hook
    const client = useQueryClient();

    const handleDebugClick = () => {
        const mutations = client.getMutationCache().getAll();
        const pending = mutations.filter(m => m.state.status === 'pending');

        if (pending.length > 0) {
            const first = pending[0];
            const failureCount = first.state.failureCount;
            const error = first.state.failureReason || 'No specific error yet (retrying...)';

            // Allow user to clear queue if stuck
            const shouldClear = window.confirm(
                `DEBUG INFO:\nStatus: ${first.state.status}\nFailures: ${failureCount}\nError: ${JSON.stringify(error)}\n\nATENÇÃO: Deseja LIMPAR a fila de sincronização? (Dados não salvos serão perdidos)`
            );

            if (shouldClear) {
                client.getMutationCache().clear();
                alert('Fila de sincronização limpa com sucesso. Tente novamente.');
                // Force reload to reset UI state
                window.location.reload();
            }
        } else {
            alert('Nenhuma mutação pendente encontrada.');
        }
    };

    if (!isOnline) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all">
                <i className="fa-solid fa-cloud-slash text-red-500 text-xs"></i>
                <span className="text-red-500 text-xs font-semibold">Offline</span>
            </div>
        );
    }

    if (activeMutations > 0) {
        // Check if any mutation is failing repeatedly
        const mutations = client.getMutationCache().getAll();
        const failingMutation = mutations.find(m => m.state.status === 'pending' && m.state.failureCount > 2);

        if (failingMutation) {
            return (
                <div
                    onClick={handleDebugClick}
                    className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all hover:bg-orange-500/20"
                    title="Clique para ver detalhes do erro"
                >
                    <i className="fa-solid fa-wifi text-orange-500 text-xs animate-pulse"></i>
                    <span className="text-orange-500 text-xs font-semibold">Conexão Instável (Tentando...)</span>
                </div>
            );
        }

        return (
            <div
                onClick={handleDebugClick}
                className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all hover:bg-yellow-500/20"
                title="Clique para ver detalhes do erro"
            >
                <i className="fa-solid fa-arrows-rotate fa-spin text-yellow-500 text-xs"></i>
                <span className="text-yellow-500 text-xs font-semibold">Salvando ({activeMutations})...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all opacity-70 hover:opacity-100">
            <i className="fa-solid fa-cloud-check text-green-500 text-xs"></i>
            <span className="text-green-500 text-xs font-semibold">Salvo</span>
        </div>
    );
};
