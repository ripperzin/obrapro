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
            // Retry if it's a network error (to keep it in 'paused' state if possible, or just keep trying)
            // React Query v5+ with networkMode: 'offlineFirst' runs the mutation. 
            // If it fails, we want it to retry. 
            // In v5, 'offlineFirst' does NOT pause automatically on network error unless we are effectively online? 
            // Actually, if we return true here, it will retry.
            if (error.message.includes('Load failed') || error.message.includes('Failed to fetch') || error.message.includes('Network request failed')) {
                return true; // Infinite retry for offline errors? Or maybe cap it? Let's try infinite for sync.
            }
            return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff max 30s
        ...options,
        onMutate: async (variables) => {
            // Allow custom onMutate to run first
            const context = await options.onMutate?.(variables);
            return context;
        },
        onError: (err, variables, context) => {
            // Default error handling or toast could go here
            console.error('Mutation failed:', err);
            if (options.onError) {
                options.onError(err, variables, context);
            }
        },
        onSettled: (data, error, variables, context) => {
            if (options.onSettled) {
                options.onSettled(data, error, variables, context);
            }
        },
    });
}
