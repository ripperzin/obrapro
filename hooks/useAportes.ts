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
