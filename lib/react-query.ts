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
        const status = error?.status || error?.code;
        const message = error?.message || '';

        // Abort on permanent logic errors
        if (message.includes('ABORT_')) {
            console.error('[MutationDefaults] Mutation aborted permanently:', message);
            return false;
        }

        // Check if it's a permanent 4xx error (logic/validation bug)
        if (status && status >= 400 && status < 500) {
            const isTransient =
                status === 401 || // Unauthorized
                status === 403 || // Forbidden
                status === 406 || // Not Acceptable
                status === 408 || // Request Timeout
                status === 429 || // Too Many Requests
                status === 'PGRST116';

            if (!isTransient) {
                console.error(`[MutationDefaults] Permanent error (${status}):`, error);
                return false;
            }
        }

        console.warn(`[MutationDefaults] Retry #${failureCount + 1}:`, error?.message || error);
        return failureCount < 50; // Max 50 retries
    },
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000), // Max 30s
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
    buster: 'v5-offline-first-robust',
};

export { queryClient };
