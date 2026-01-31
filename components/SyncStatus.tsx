import React from 'react';
import { useIsMutating } from '@tanstack/react-query';
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

    if (!isOnline) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all">
                <i className="fa-solid fa-cloud-slash text-red-500 text-xs"></i>
                <span className="text-red-500 text-xs font-semibold">Offline</span>
            </div>
        );
    }

    if (activeMutations > 0) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all">
                <i className="fa-solid fa-arrows-rotate fa-spin text-yellow-500 text-xs"></i>
                <span className="text-yellow-500 text-xs font-semibold">Salvando ({activeMutations})...</span>
            </div>
        );
    }

    // Optional: fleeting "Saved" state or just static
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-md pointer-events-auto transition-all opacity-70 hover:opacity-100">
            <i className="fa-solid fa-cloud-check text-green-500 text-xs"></i>
            <span className="text-green-500 text-xs font-semibold">Salvo</span>
        </div>
    );
};
