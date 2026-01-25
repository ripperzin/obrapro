import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 1000 * 60 * 60 * 24, // 24 hours
            staleTime: 1000 * 60 * 5, // 5 minutes
            retry: 1,
            networkMode: 'offlineFirst',
        },
        mutations: {
            networkMode: 'offlineFirst',
        },
    },
});

const localStoragePersister = createSyncStoragePersister({
    storage: window.localStorage,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
    persister: localStoragePersister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
};

export { queryClient };
