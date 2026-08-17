import { useMutation, UseMutationOptions } from '@tanstack/react-query';
import { useToast } from '../components/ToastProvider';

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
// A gravação falhou DE VEZ: o que o usuário precisa ler.
// Chega-se aqui só depois das retentativas (erro de rede tenta 8×, ver
// retryConfig em lib/react-query.ts), então não é "sem sinal agora" — é desistiu.
// E cada mutation DESFAZ a alteração na tela no onError, ou seja: o lançamento
// desaparece. Sem aviso, o usuário jura que salvou. Era a "perda silenciosa".
const avisoDeFalha = (err: unknown): string => {
    const message = (err as { message?: string })?.message || '';
    const code = typeof (err as { code?: unknown })?.code === 'string' ? (err as { code: string }).code : '';
    const isRede = !code && /Failed to fetch|Load failed|NetworkError|network|fetch/i.test(message);
    return isRede
        ? 'NÃO SALVOU: a internet não voltou e desfiz na tela. Lance de novo quando o sinal estabilizar.'
        : 'NÃO SALVOU: desfiz a alteração na tela. Tente de novo; se repetir, fale com o suporte.';
};

export function useOfflineMutation<TData, TError, TVariables>(
    options: UseMutationOptions<TData, TError, TVariables, OfflineMutationContext>
) {
    const toast = useToast();

    return useMutation<TData, TError, TVariables, OfflineMutationContext>({
        // Retry and scope configs are inherited from setMutationDefaults
        // Only override the callbacks (onMutate, onError, onSuccess)
        ...options,
        onMutate: async (variables) => {
            const context = options.onMutate ? await (options.onMutate as any)(variables) : undefined;
            return context as OfflineMutationContext;
        },
        onError: (err, variables, context) => {
            console.error('[useOfflineMutation] Error:', err);
            // Ponto ÚNICO por onde passa toda gravação do app (despesa, aporte,
            // obra, unidade, documento, diário) — o aviso aqui cobre todas.
            toast.error(avisoDeFalha(err));
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
