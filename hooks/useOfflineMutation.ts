import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';

// Generic type for mutation context to support optimistic updates
interface OfflineMutationContext {
    previousData: unknown;
}

export function useOfflineMutation<TData, TError, TVariables>(
    options: UseMutationOptions<TData, TError, TVariables, OfflineMutationContext>
) {
    const queryClient = useQueryClient();
    const isOnline = useOnlineStatus();

    return useMutation<TData, TError, TVariables, OfflineMutationContext>({
        retry: (failureCount, error: any) => {
            // 1. Permanent Errors (Logic, Validation, 400 Bad Request) -> Fail immediately
            // We assume 4xx are permanent, EXCEPT 401 (Unauthorized), 408 (Timeout), 429 (Too Many Requests)
            // Supabase/Postgrest errors often come as objects with 'code' or 'status'
            const status = error?.status || error?.code;

            // Check if it's a permanent 4xx error (logic/validation bug)
            // Error 406 (Not Acceptable) is also often configuration
            if (status && status >= 400 && status < 500) {
                // Whitelist transient 4xx errors
                const isTransient =
                    status === 401 || // Unauthorized (Token expired/race condition) -> RETRY
                    status === 408 || // Request Timeout -> RETRY
                    status === 429 || // Too Many Requests -> RETRY
                    status === 'PGRST116'; // JSON object returned null (sometimes happens)

                if (!isTransient) {
                    console.error(`Mutation failed permanently (Status ${status}):`, error);
                    return false; // Stop retrying
                }
            }

            // 2. Transient Errors (Network, Server 5xx, Auth 401) -> Retry "Infinitely"
            // We cap at a high number (e.g., 50) to prevent literal freeze if something is truly broken for days
            // but 50 * 30s = 25 minutes of retrying.
            return failureCount < 50;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Max 10s wait between retries
        ...options,
        onMutate: async (variables) => {
            // Allow custom onMutate to run first
            // Fix: React Query onMutate only takes variables
            const context = options.onMutate ? await options.onMutate(variables) : undefined;
            return context as OfflineMutationContext;
        },
        onError: (err, variables, context) => {
            // Default error handling or toast could go here
            console.error('Mutation failed:', err);
            if (options.onError) {
                (options.onError as any)(err, variables, context);
            }
        },
        onSettled: (data, error, variables, context) => {
            if (options.onSettled) {
                (options.onSettled as any)(data, error, variables, context);
            }
        },
    });
}
