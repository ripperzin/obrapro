import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export interface AddAcquisitionInput {
    projectId: string;
    category: string;
    description?: string;
    value: number;
    date: string;
    paidFromProject: boolean;
    paidByInvestorId?: string;
    paidWithUnits?: boolean;
    attachments?: string[];
    userId?: string;
    userName?: string;
}

export const useAddAcquisitionCost = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: AddAcquisitionInput) => {
            const { data, error } = await supabase.from('acquisition_costs').insert([{
                project_id: input.projectId,
                category: input.category,
                description: input.description || null,
                value: input.value,
                date: input.date,
                paid_from_project: input.paidFromProject,
                paid_by_investor_id: input.paidByInvestorId || null,
                paid_with_units: input.paidWithUnits || false,
                attachments: input.attachments || [],
                user_id: input.userId || null,
                user_name: input.userName || null,
            }]).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export const useUpdateAcquisitionCost = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: AddAcquisitionInput & { id: string }) => {
            const { data, error } = await supabase.from('acquisition_costs').update({
                category: input.category,
                description: input.description || null,
                value: input.value,
                date: input.date,
                paid_from_project: input.paidFromProject,
                paid_by_investor_id: input.paidByInvestorId || null,
                paid_with_units: input.paidWithUnits || false,
                attachments: input.attachments || [],
            }).eq('id', input.id).select().single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export const useDeleteAcquisitionCost = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('acquisition_costs').delete().eq('id', id);
            if (error) throw error;
            return id;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};
