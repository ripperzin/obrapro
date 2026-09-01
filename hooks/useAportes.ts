import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

/**
 * Mutations dos Aportes de Investidores.
 * Gravam direto no Supabase e invalidam ['projects'] para o caixa recalcular.
 */

export interface AddInvestorInput {
    projectId: string;
    name: string;
    email?: string;
    phone?: string;
}

export const useAddInvestor = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: AddInvestorInput) => {
            const { data, error } = await supabase.from('investors').insert([{
                project_id: input.projectId,
                name: input.name,
                email: input.email || null,
                phone: input.phone || null,
            }]).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export interface UpdateInvestorInput {
    id: string;
    name: string;
}

export const useUpdateInvestor = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: UpdateInvestorInput) => {
            const { error } = await supabase.from('investors').update({ name: input.name }).eq('id', input.id);
            if (error) throw error;
            return input.id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

// Meta de aporte "à mão": grava o valor combinado do sócio (null = volta ao automático).
export const useSetInvestorAcordado = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { id: string; valorAcordado: number | null }) => {
            const { error } = await supabase
                .from('investors')
                .update({ valor_acordado: input.valorAcordado })
                .eq('id', input.id);
            if (error) throw error;
            return input.id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export interface AddContributionInput {
    projectId: string;
    investorId: string;
    value: number;
    date: string;
    description?: string;
    userId?: string;
    userName?: string;
    attachments?: string[];
}

export const useAddContribution = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: AddContributionInput) => {
            const { data, error } = await supabase.from('contributions').insert([{
                project_id: input.projectId,
                investor_id: input.investorId,
                value: input.value,
                date: input.date,
                description: input.description || null,
                user_id: input.userId || null,
                user_name: input.userName || null,
                attachments: input.attachments || [],
            }]).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

// Corrigir um aporte JÁ lançado (valor e/ou data). Antes só existia lançar e
// apagar: pra acertar um valor digitado errado o usuário tinha que desfazer e
// lançar de novo. Pedido dos sócios da LARANJAIS na validação de 17/08.
// Mexe em valor, data e COMPROVANTE — não em quem aportou.
// O comprovante entrou depois (01/09): antes só dava pra anexar no instante do
// lançamento, e quem marcava o aporte como pago na hora (com o PDF do banco
// chegando só depois) ficava sem jeito de anexar — a única saída era apagar o
// aporte e lançar de novo, o que mexe no caixa 2× e desfaz a ligação com a parcela.
// `attachments` só é gravado quando vem no input: quem chamar sem o campo (se
// aparecer outro caminho de correção) não apaga o anexo por descuido.
export const useUpdateContribution = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: { id: string; value: number; date: string; attachments?: string[] }) => {
            const { error } = await supabase
                .from('contributions')
                .update({
                    value: input.value,
                    date: input.date,
                    ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
                })
                .eq('id', input.id);
            if (error) throw error;
            return input.id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export const useDeleteContribution = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('contributions').delete().eq('id', id);
            if (error) throw error;
            return id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export const useDeleteInvestor = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            // Aportes do investidor caem junto (ON DELETE CASCADE no banco)
            const { error } = await supabase.from('investors').delete().eq('id', id);
            if (error) throw error;
            return id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};
