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

    if (projectsError) {
        // Detect auth errors (JWT expired, invalid session) and force re-login
        const errMsg = projectsError.message || '';
        const errCode = (projectsError as any)?.code || '';
        if (errCode === 'PGRST301' || errMsg.includes('JWT') || 
            errMsg.includes('expired') || errMsg.includes('invalid claim')) {
            console.error('[fetchProjects] Erro de autenticação detectado, forçando re-login');
            await supabase.auth.signOut();
        }
        throw projectsError;
    }
    if (!projectsData) return [];

    const projectIds = projectsData.map((p: any) => p.id);
    let diaryMap: Record<string, any[]> = {};
    let evidenceMap: Record<string, any[]> = {};
    let budgetMap: Record<string, any> = {};
    let investorMap: Record<string, any[]> = {};
    let contributionMap: Record<string, any[]> = {};
    let acquisitionMap: Record<string, any[]> = {};
    let profitShareMap: Record<string, any[]> = {};

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
                        timeBased: m.time_based || false,
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

        const { data: investorsData } = await supabase
            .from('investors')
            .select('*')
            .in('project_id', projectIds);
        if (investorsData) {
            investorsData.forEach((i: any) => {
                if (!investorMap[i.project_id]) investorMap[i.project_id] = [];
                investorMap[i.project_id].push(i);
            });
        }

        const { data: contributionsData } = await supabase
            .from('contributions')
            .select('*')
            .in('project_id', projectIds);
        if (contributionsData) {
            contributionsData.forEach((c: any) => {
                if (!contributionMap[c.project_id]) contributionMap[c.project_id] = [];
                contributionMap[c.project_id].push(c);
            });
        }

        const { data: acquisitionData } = await supabase
            .from('acquisition_costs')
            .select('*')
            .in('project_id', projectIds);
        if (acquisitionData) {
            acquisitionData.forEach((a: any) => {
                if (!acquisitionMap[a.project_id]) acquisitionMap[a.project_id] = [];
                acquisitionMap[a.project_id].push(a);
            });
        }

        const { data: profitShareData } = await supabase
            .from('profit_shares')
            .select('*')
            .in('project_id', projectIds);
        if (profitShareData) {
            profitShareData.forEach((s: any) => {
                if (!profitShareMap[s.project_id]) profitShareMap[s.project_id] = [];
                profitShareMap[s.project_id].push(s);
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
        custoM2: p.custo_m2 || 0,
        financedByInvestorId: p.financed_by_investor_id || undefined,
        splitMode: (p.split_mode as 'percent' | 'unit') || 'percent',
        archived: p.archived || false,
        progress: p.progress || 0,
        // Ordena por identificador de forma NUMÉRICA (numeric:true → "CASA 2" antes
        // de "CASA 10", não depois). Sem isto o Postgres devolve as unidades em ordem
        // arbitrária e editar uma casa a fazia "pular" de posição na tela. Ordenar
        // aqui vale para todos os consumidores (aba Unidades, dashboards, PDF, link).
        units: (p.units || []).map((u: any) => ({
            ...u,
            valorEstimadoVenda: u.valor_estimado_venda || 0,
            saleValue: u.sale_value,
            saleDate: u.sale_date,
            ownerInvestorId: u.owner_investor_id || undefined
        })).sort((a: any, b: any) =>
            (a.identifier || '').localeCompare(b.identifier || '', 'pt-BR', { numeric: true, sensitivity: 'base' })
        ),
        expenses: (p.expenses || []).map((e: any) => ({
            ...e,
            userId: e.user_id,
            userName: e.user_name,
            attachmentUrl: e.attachment_url,
            attachments: e.attachments || [],
            macroId: e.macro_id,
            subMacroId: e.sub_macro_id,
            itemId: e.item_id || undefined,
            paidByInvestorId: e.paid_by_investor_id || undefined
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
        budget: budgetMap[p.id],
        investors: (investorMap[p.id] || []).map((i: any) => ({
            id: i.id,
            projectId: i.project_id,
            name: i.name,
            email: i.email,
            phone: i.phone,
            createdAt: i.created_at
        })),
        contributions: (contributionMap[p.id] || []).map((c: any) => ({
            id: c.id,
            projectId: c.project_id,
            investorId: c.investor_id,
            value: c.value,
            date: c.date,
            description: c.description,
            userId: c.user_id,
            userName: c.user_name,
            attachments: c.attachments || [],
            createdAt: c.created_at
        })),
        acquisitionCosts: (acquisitionMap[p.id] || []).map((a: any) => ({
            id: a.id,
            projectId: a.project_id,
            category: a.category,
            description: a.description,
            value: a.value,
            date: a.date,
            paidFromProject: a.paid_from_project,
            attachments: a.attachments || [],
            userId: a.user_id,
            userName: a.user_name,
            createdAt: a.created_at
        })),
        profitShares: (profitShareMap[p.id] || []).map((s: any) => ({
            id: s.id,
            projectId: s.project_id,
            investorId: s.investor_id,
            name: s.name,
            percentage: s.percentage,
            naoAporta: s.nao_aporta || false,
            createdAt: s.created_at
        }))
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
                units: [], expenses: [], logs: [], documents: [], diary: [], stageEvidence: [], budget: undefined, investors: [], contributions: []
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
