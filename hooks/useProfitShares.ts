import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export interface ShareInput {
    investorId?: string;
    name: string;
    percentage: number;
    naoAporta?: boolean;
}

/**
 * Salva a lista de participação nos lucros (replace-all: apaga e reinsere).
 * Lista pequena por obra, então a substituição total é simples e confiável.
 */
export const useSaveProfitShares = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { projectId: string; shares: ShareInput[] }) => {
            const { error: delErr } = await supabase
                .from('profit_shares')
                .delete()
                .eq('project_id', input.projectId);
            if (delErr) throw delErr;

            const rows = input.shares
                .filter((s) => s.name.trim())
                .map((s) => ({
                    project_id: input.projectId,
                    investor_id: s.investorId || null,
                    name: s.name.trim(),
                    percentage: s.percentage || 0,
                    nao_aporta: s.naoAporta || false,
                }));

            if (rows.length > 0) {
                const { error: insErr } = await supabase.from('profit_shares').insert(rows);
                if (insErr) throw insErr;
            }
            return true;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};
