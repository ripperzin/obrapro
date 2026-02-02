import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

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
            networkMode: 'offlineFirst', // Restore: Ensure mutations are attempted even if browser thinks it's offline
        },
    },
});

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
    throttleTime: 100, // FAST SAVE: Reduce throttle from 1000ms to 100ms to prevent data loss if app closes
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
    persister: asyncPersister,
    dehydrateOptions: {
        shouldDehydrateMutation: () => true,
        shouldDehydrateQuery: (query) => {
            const queryState = query.state
            if (queryState.data === undefined) return false
            return true
        },
    },
    buster: 'v4-final-clean', // Force clear cache to remove old mutations stuck in infinite retry
};

export { queryClient };
