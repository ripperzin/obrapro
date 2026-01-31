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
            // Check for common network/offline errors
            const isNetworkError =
                error.message.includes('Load failed') ||
                error.message.includes('Failed to fetch') ||
                error.message.includes('Network request failed') ||
                error.message.includes('network') ||
                error.code === 'PGRST' || // Supabase connection errors often behave this way
                !window.navigator.onLine; // Browser reports offline

            if (isNetworkError) {
                return true; // Infinite retry for offline/network issues
            }

            // For logic errors (like validation), fail after 3 attempts
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
