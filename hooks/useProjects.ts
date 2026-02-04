import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { Project } from '../types';
import { useOfflineMutation } from './useOfflineMutation';
import { generateId } from '../utils';
import {
    CreateProjectInput,
    UpdateProjectInput,
    DeleteUnitInput,
    DeleteExpenseInput,
    DeleteDocumentInput,
    DeleteDiaryEntryInput
} from '../lib/mutationFunctions';

export const fetchProjects = async (): Promise<Project[]> => {
    const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          units (*),
          expenses (*),
          logs (*),
          documents (*)
        `);

    if (projectsError) throw projectsError;
    if (!projectsData) return [];

    const projectIds = projectsData.map((p: any) => p.id);
    let diaryMap: Record<string, any[]> = {};
    let evidenceMap: Record<string, any[]> = {};
    let budgetMap: Record<string, any> = {};

    if (projectIds.length > 0) {
        const { data: diaryData } = await supabase
            .from('diary_entries')
            .select('*')
            .in('project_id', projectIds);

        if (diaryData) {
            diaryData.forEach((d: any) => {
                if (!diaryMap[d.project_id]) diaryMap[d.project_id] = [];
                diaryMap[d.project_id].push(d);
            });
        }

        const { data: evidenceData } = await supabase
            .from('stage_evidences')
            .select('*')
            .in('project_id', projectIds);

        if (evidenceData) {
            evidenceData.forEach((e: any) => {
                if (!evidenceMap[e.project_id]) evidenceMap[e.project_id] = [];
                evidenceMap[e.project_id].push(e);
            });
        }

        const { data: budgetsData } = await supabase
            .from('project_budgets')
            .select('*, project_macros(*, project_sub_macros(*))')
            .in('project_id', projectIds);

        if (budgetsData) {
            budgetsData.forEach((b: any) => {
                budgetMap[b.project_id] = {
                    id: b.id,
                    projectId: b.project_id,
                    totalEstimated: b.total_estimated,
                    templateId: b.template_id,
                    createdAt: b.created_at,
                    macros: (b.project_macros || []).map((m: any) => ({
                        id: m.id,
                        budgetId: m.budget_id,
                        name: m.name,
                        percentage: m.percentage,
                        estimatedValue: m.estimated_value,
                        spentValue: m.spent_value,
                        displayOrder: m.display_order,
                        plannedStartDate: m.planned_start_date,
                        plannedEndDate: m.planned_end_date,
                        subMacros: (m.project_sub_macros || []).map((sm: any) => ({
                            id: sm.id,
                            projectMacroId: sm.project_macro_id,
                            name: sm.name,
                            percentage: sm.percentage,
                            estimatedValue: sm.estimated_value,
                            spentValue: sm.spent_value,
                            displayOrder: sm.display_order
                        })).sort((a: any, b: any) => a.displayOrder - b.displayOrder)
                    })).sort((a: any, b: any) => a.displayOrder - b.displayOrder)
                };
            });
        }
    }

    return projectsData.map((p: any) => ({
        ...p,
        startDate: p.start_date || null,
        deliveryDate: p.delivery_date || null,
        unitCount: p.unit_count || 0,
        totalArea: p.total_area || 0,
        expectedTotalCost: p.expected_total_cost || 0,
        expectedTotalSales: p.expected_total_sales || 0,
        progress: p.progress || 0,
        units: (p.units || []).map((u: any) => ({
            ...u,
            valorEstimadoVenda: u.valor_estimado_venda || 0,
            saleValue: u.sale_value,
            saleDate: u.sale_date
        })),
        expenses: (p.expenses || []).map((e: any) => ({
            ...e,
            attachmentUrl: e.attachment_url,
            attachments: e.attachments || [],
            macroId: e.macro_id,
            subMacroId: e.sub_macro_id
        })),
        logs: (p.logs || []).map((l: any) => ({
            ...l,
            timestamp: l.timestamp,
            userId: l.user_id,
            userName: l.user_name,
            oldValue: l.old_value,
            newValue: l.new_value
        })),
        documents: (p.documents || []).map((d: any) => ({
            id: d.id,
            title: d.title,
            category: d.category,
            url: d.url,
            createdAt: d.created_at
        })),
        diary: (diaryMap[p.id] || []).map((d: any) => ({
            id: d.id,
            date: d.date,
            content: d.content,
            photos: d.photos || [],
            author: d.author,
            createdAt: d.created_at
        })),
        stageEvidence: (evidenceMap && evidenceMap[p.id] || []).map((e: any) => ({
            stage: e.stage,
            photos: e.photos || [],
            date: e.date,
            notes: e.notes,
            user: e.user_name
        })),
        budget: budgetMap[p.id]
    }));
};

export const useProjects = () => {
    return useQuery({
        queryKey: ['projects'],
        queryFn: fetchProjects,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};

// ============================================================================
// PROJECT MUTATIONS
// Note: mutationFn is inherited from setMutationDefaults in react-query.ts
// ============================================================================

export const useCreateProject = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<any, Error, CreateProjectInput>({
        mutationKey: ['createProject'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async (newProject) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);
            const optimisticId = newProject.id || generateId();
            const optimisticProject: Project = {
                id: optimisticId,
                ...newProject as any,
                units: [], expenses: [], logs: [], documents: [], diary: [], stageEvidence: [], budget: undefined
            };
            queryClient.setQueryData<Project[]>(['projects'], (old) => old ? [...old, optimisticProject] : [optimisticProject]);
            return { previousData: previousProjects || [] };
        },
        onError: (err, newProject, context) => {
            console.error('[useCreateProject] Error:', err);
            if (context?.previousData) queryClient.setQueryData(['projects'], context.previousData);
        },
        onSuccess: () => {
            // Only invalidate on SUCCESS - this is key for offline-first!
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useUpdateProject = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<any, Error, UpdateProjectInput>({
        mutationKey: ['updateProject'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async (input) => {
            const { id, updates } = input;
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);

            // Find current project for diffing (needed by mutationFn)
            const currentProject = previousProjects?.find(p => p.id === id);

            // Attach currentProject to input for the mutationFn to use
            if (currentProject) {
                input.currentProject = currentProject;
            }

            queryClient.setQueryData<Project[]>(['projects'], (old) => {
                return old?.map(p => p.id === id ? { ...p, ...updates } : p) || [];
            });

            return { previousData: previousProjects };
        },
        onError: (err, variables, context) => {
            console.error('[useUpdateProject] Error:', err);
            if (context?.previousData) {
                queryClient.setQueryData(['projects'], context.previousData);
            }
        },
        onSuccess: () => {
            // Only invalidate on SUCCESS
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useDeleteProject = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<string, Error, string>({
        mutationKey: ['deleteProject'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async (projectId) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);
            queryClient.setQueryData<Project[]>(['projects'], (old) => old?.filter(p => p.id !== projectId) || []);
            return { previousData: previousProjects || [] };
        },
        onError: (err, variables, context) => {
            console.error('[useDeleteProject] Error:', err);
            if (context?.previousData) queryClient.setQueryData(['projects'], context.previousData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useDeleteUnit = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<DeleteUnitInput, Error, DeleteUnitInput>({
        mutationKey: ['deleteUnit'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async ({ projectId, unitId }) => {
            console.log('[useDeleteUnit] Optimistic delete:', { projectId, unitId });
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);

            queryClient.setQueryData<Project[]>(['projects'], (old) => {
                if (!old) return [];
                return old.map(project => {
                    if (project.id !== projectId) return project;
                    const updatedUnits = project.units.filter(u => u.id !== unitId);

                    // Recalculate totals immediately for optimistic UI
                    const expectedTotalCost = updatedUnits.reduce((sum, u) => sum + (u.cost || 0), 0);
                    const expectedTotalSales = updatedUnits.reduce((sum, u) => sum + (u.saleValue || u.valorEstimadoVenda || 0), 0);

                    const updatedBudget = project.budget ? {
                        ...project.budget,
                        totalEstimated: expectedTotalCost
                    } : undefined;

                    return { ...project, units: updatedUnits, expectedTotalCost, expectedTotalSales, budget: updatedBudget };
                });
            });

            return { previousData: previousProjects || [] };
        },
        onError: (err, variables, context) => {
            console.error('[useDeleteUnit] Error:', err);
            if (context?.previousData) queryClient.setQueryData(['projects'], context.previousData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useDeleteExpense = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<DeleteExpenseInput, Error, DeleteExpenseInput>({
        mutationKey: ['deleteExpense'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async ({ projectId, expenseId }) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);

            queryClient.setQueryData<Project[]>(['projects'], (old) => {
                if (!old) return [];
                return old.map(project => {
                    if (project.id !== projectId) return project;
                    const updatedExpenses = project.expenses.filter(e => e.id !== expenseId);
                    return { ...project, expenses: updatedExpenses };
                });
            });

            return { previousData: previousProjects || [] };
        },
        onError: (err, variables, context) => {
            console.error('[useDeleteExpense] Error:', err);
            if (context?.previousData) queryClient.setQueryData(['projects'], context.previousData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useDeleteDocument = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<DeleteDocumentInput, Error, DeleteDocumentInput>({
        mutationKey: ['deleteDocument'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async ({ projectId, documentId }) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);

            queryClient.setQueryData<Project[]>(['projects'], (old) => {
                if (!old) return [];
                return old.map(project => {
                    if (project.id !== projectId) return project;
                    const updatedDocs = project.documents.filter(d => d.id !== documentId);
                    return { ...project, documents: updatedDocs };
                });
            });

            return { previousData: previousProjects || [] };
        },
        onError: (err, variables, context) => {
            console.error('[useDeleteDocument] Error:', err);
            if (context?.previousData) queryClient.setQueryData(['projects'], context.previousData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useDeleteDiaryEntry = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation<DeleteDiaryEntryInput, Error, DeleteDiaryEntryInput>({
        mutationKey: ['deleteDiaryEntry'],
        // mutationFn is inherited from setMutationDefaults
        onMutate: async ({ projectId, entryId }) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);

            queryClient.setQueryData<Project[]>(['projects'], (old) => {
                if (!old) return [];
                return old.map(project => {
                    if (project.id !== projectId) return project;
                    const updatedDiary = project.diary.filter(d => d.id !== entryId);
                    return { ...project, diary: updatedDiary };
                });
            });

            return { previousData: previousProjects || [] };
        },
        onError: (err, variables, context) => {
            console.error('[useDeleteDiaryEntry] Error:', err);
            if (context?.previousData) queryClient.setQueryData(['projects'], context.previousData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};
