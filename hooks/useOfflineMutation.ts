import { useMutation, UseMutationOptions } from '@tanstack/react-query';

// Generic type for mutation context to support optimistic updates
interface OfflineMutationContext {
    previousData: unknown;
}

/**
 * Wrapper around useMutation for offline-first behavior.
 * 
 * Note: mutationFn should be defined via setMutationDefaults in react-query.ts
 * This allows mutations to be rehydrated after page reload since functions
 * cannot be serialized to IndexedDB.
 */
export function useOfflineMutation<TData, TError, TVariables>(
    options: UseMutationOptions<TData, TError, TVariables, OfflineMutationContext>
) {
    return useMutation<TData, TError, TVariables, OfflineMutationContext>({
        // Retry and scope configs are inherited from setMutationDefaults
        // Only override the callbacks (onMutate, onError, onSuccess)
        ...options,
        onMutate: async (variables) => {
            const context = options.onMutate ? await options.onMutate(variables) : undefined;
            return context as OfflineMutationContext;
        },
        onError: (err, variables, context) => {
            console.error('[useOfflineMutation] Error:', err);
            if (options.onError) {
                (options.onError as Function)(err, variables, context);
            }
        },
        onSuccess: (data, variables, context) => {
            console.log('[useOfflineMutation] Success:', options.mutationKey);
            if (options.onSuccess) {
                (options.onSuccess as Function)(data, variables, context);
            }
        },
        onSettled: (data, error, variables, context) => {
            // Log sync status for debugging
            if (error) {
                console.warn('[useOfflineMutation] Settled with error (will retry):', error);
            } else {
                console.log('[useOfflineMutation] Settled successfully');
            }
            if (options.onSettled) {
                (options.onSettled as any)(data, error, variables, context);
            }
        },
    });
}
