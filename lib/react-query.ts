import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

// Import standalone mutation functions for setMutationDefaults
import {
    createProjectMutationFn,
    updateProjectMutationFn,
    deleteProjectMutationFn,
    deleteUnitMutationFn,
    deleteExpenseMutationFn,
    deleteDocumentMutationFn,
    deleteDiaryEntryMutationFn
} from './mutationFunctions';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60 * 24, // 24 hours
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            networkMode: 'offlineFirst',
            refetchOnWindowFocus: false, // Prevent refetch when switching tabs
        },
        mutations: {
            networkMode: 'offlineFirst', // Ensure mutations are attempted even if browser thinks it's offline
            gcTime: 1000 * 60 * 60 * 24 * 7, // Keep mutations for 7 days for offline sync
        },
    },
});

// ============================================================================
// MUTATION DEFAULTS - Required for offline persistence
// Functions cannot be serialized to IndexedDB, so we register them here
// to allow rehydration after page reload
// ============================================================================

// Retry configuration shared by all mutations
const retryConfig = {
    retry: (failureCount: number, error: any) => {
        const message = error?.message || '';
        const code = typeof error?.code === 'string' ? error.code : '';
        const numStatus = typeof error?.status === 'number' ? error.status
            : typeof error?.statusCode === 'number' ? error.statusCode
            : null;

        // Abort explícito
        if (message.includes('ABORT_')) {
            console.error('[MutationDefaults] Mutation aborted permanently:', message);
            return false;
        }

        // Erros de REDE (sem code do servidor) → transitórios, retenta limitado.
        const isNetwork = !code && (
            message.includes('Failed to fetch') || message.includes('Load failed') ||
            message.includes('NetworkError') || message.includes('network') || message.includes('fetch')
        );
        if (isNetwork) {
            console.warn(`[MutationDefaults] Erro de rede, retry #${failureCount + 1}:`, message);
            return failureCount < 8;
        }

        // 5xx do servidor → transitório, retenta pouco.
        if (numStatus && numStatus >= 500) return failureCount < 5;

        // QUALQUER erro com code do PostgREST/Postgres é DETERMINÍSTICO (schema PGRST204/301,
        // FK 23503, único 23505, check 23514, RLS 42501, etc.) → abortar (não adianta retentar,
        // e retentar prende a fila serial e reverte os dados). ESTE era o bug do entupimento.
        if (code) {
            console.error(`[MutationDefaults] Erro determinístico (code ${code}) — abortando:`, message);
            return false;
        }

        // 4xx permanente (fora 408/429)
        if (numStatus && numStatus >= 400 && numStatus < 500 && numStatus !== 408 && numStatus !== 429) {
            console.error(`[MutationDefaults] Erro permanente (${numStatus}) — abortando:`, error);
            return false;
        }

        // Schema/coluna por texto (redundância)
        if (message.includes('Could not find') || message.includes('column')) return false;

        // Desconhecido: retenta pouquíssimo e desiste (nunca prende a fila por 25 min).
        console.warn(`[MutationDefaults] Erro desconhecido, retry #${failureCount + 1}:`, message);
        return failureCount < 3;
    },
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 15000), // Máx 15s
};

// Project mutations
queryClient.setMutationDefaults(['createProject'], {
    mutationFn: createProjectMutationFn,
    scope: { id: 'projects' }, // Ensures serial execution for project operations
    ...retryConfig,
});

queryClient.setMutationDefaults(['updateProject'], {
    mutationFn: updateProjectMutationFn,
    scope: { id: 'projects' },
    ...retryConfig,
});

queryClient.setMutationDefaults(['deleteProject'], {
    mutationFn: deleteProjectMutationFn,
    scope: { id: 'projects' },
    ...retryConfig,
});

// Unit mutations
queryClient.setMutationDefaults(['deleteUnit'], {
    mutationFn: deleteUnitMutationFn,
    scope: { id: 'projects' },
    ...retryConfig,
});

// Expense mutations
queryClient.setMutationDefaults(['deleteExpense'], {
    mutationFn: deleteExpenseMutationFn,
    scope: { id: 'projects' },
    ...retryConfig,
});

// Document mutations
queryClient.setMutationDefaults(['deleteDocument'], {
    mutationFn: deleteDocumentMutationFn,
    scope: { id: 'projects' },
    ...retryConfig,
});

// Diary entry mutations
queryClient.setMutationDefaults(['deleteDiaryEntry'], {
    mutationFn: deleteDiaryEntryMutationFn,
    scope: { id: 'projects' },
    ...retryConfig,
});

// ============================================================================
// PERSISTER CONFIGURATION
// ============================================================================

const asyncPersister = createAsyncStoragePersister({
    storage: {
        getItem: async (key) => {
            const val = await get(key);
            return val || null;
        },
        setItem: async (key, value) => {
            await set(key, value);
        },
        removeItem: async (key) => {
            await del(key);
        },
    },
    throttleTime: 100, // Fast save to prevent data loss
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
    persister: asyncPersister,
    dehydrateOptions: {
        shouldDehydrateMutation: (mutation) => {
            // Only persist mutations that are pending (not completed/failed permanently)
            // This prevents re-running completed mutations after reload
            return mutation.state.status === 'pending';
        },
        shouldDehydrateQuery: (query) => {
            const queryState = query.state;
            if (queryState.data === undefined) return false;
            return true;
        },
    },
    // IMPORTANT: Increment buster to force clear old stuck mutations
    buster: 'v15-retry-fix-2026-07-12',
};

export { queryClient };
