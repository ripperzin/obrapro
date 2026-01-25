import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { Project } from '../types';
import { useOfflineMutation } from './useOfflineMutation';
import { generateId } from '../utils';

export const fetchProjects = async (): Promise<Project[]> => {
    // ... (fetchProjects implementation same as before)
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
            .select('*, project_macros(*)')
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
                        plannedEndDate: m.planned_end_date
                    }))
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
    });
};

export const useCreateProject = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation({
        mutationFn: async (projectData: Omit<Project, 'id' | 'units' | 'expenses' | 'logs' | 'documents' | 'diary' | 'stageEvidence' | 'budget'> & { id?: string, userId: string, userName: string }) => {
            const id = projectData.id || generateId();
            const { data, error } = await supabase.from('projects').insert([{
                id: id,
                name: projectData.name,
                start_date: projectData.startDate || null,
                delivery_date: projectData.deliveryDate || null,
                unit_count: projectData.unitCount,
                total_area: projectData.totalArea,
                expected_total_cost: projectData.expectedTotalCost,
                expected_total_sales: projectData.expectedTotalSales,
                progress: projectData.progress
            }]).select().single();

            if (error) throw error;

            await supabase.from('logs').insert([{
                project_id: id,
                user_id: projectData.userId,
                user_name: projectData.userName,
                action: 'Criação',
                field: 'Projeto',
                old_value: '-',
                new_value: projectData.name
            }]);

            return data;
        },
        onMutate: async (newProject) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);
            const optimisticId = newProject.id || generateId();
            const optimisticProject: Project = {
                id: optimisticId,
                ...newProject,
                units: [], expenses: [], logs: [], documents: [], diary: [], stageEvidence: [], budget: undefined
            };
            queryClient.setQueryData<Project[]>(['projects'], (old) => old ? [...old, optimisticProject] : [optimisticProject]);
            return { previousProjects };
        },
        onError: (err, newProject, context) => {
            if (context?.previousProjects) queryClient.setQueryData(['projects'], context.previousProjects);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};

export const useUpdateProject = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation({
        mutationFn: async ({ id, updates, logMsg, user }: { id: string, updates: Partial<Project>, logMsg?: string, user?: { id: string, name: string } }) => {
            // Get current cache to diff
            const currentProjects = queryClient.getQueryData<Project[]>(['projects']) || [];
            const currentProject = currentProjects.find(p => p.id === id);

            // 1. Basic Fields Update
            const supabaseUpdates: any = {};
            if (updates.name !== undefined) supabaseUpdates.name = updates.name;
            if (updates.startDate !== undefined) supabaseUpdates.start_date = updates.startDate;
            if (updates.deliveryDate !== undefined) supabaseUpdates.delivery_date = updates.deliveryDate;
            if (updates.progress !== undefined) supabaseUpdates.progress = updates.progress;
            if (updates.unitCount !== undefined) supabaseUpdates.unit_count = updates.unitCount;
            if (updates.totalArea !== undefined) supabaseUpdates.total_area = updates.totalArea;
            if (updates.expectedTotalCost !== undefined) supabaseUpdates.expected_total_cost = updates.expectedTotalCost;
            if (updates.expectedTotalSales !== undefined) supabaseUpdates.expected_total_sales = updates.expectedTotalSales;

            if (Object.keys(supabaseUpdates).length > 0) {
                const { error } = await supabase.from('projects').update(supabaseUpdates).eq('id', id);
                if (error) throw error;
            }

            // 2. Units
            if (updates.units) {
                const unitsToUpsert = updates.units.map(u => ({
                    id: u.id,
                    project_id: id,
                    identifier: u.identifier,
                    area: u.area,
                    cost: u.cost,
                    status: u.status,
                    valor_estimado_venda: u.valorEstimadoVenda,
                    sale_value: u.saleValue,
                    sale_date: u.saleDate
                }));
                const { error } = await supabase.from('units').upsert(unitsToUpsert, { onConflict: 'id' });
                if (error) throw error;
            }

            // 3. Expenses (Diffing)
            if (updates.expenses !== undefined) {
                const currentExpenseIds = currentProject?.expenses.map(e => e.id) || [];
                const newExpenseIds = updates.expenses.map(e => e.id);
                const deletedExpenseIds = currentExpenseIds.filter(eid => !newExpenseIds.includes(eid));

                if (deletedExpenseIds.length > 0) {
                    await supabase.from('expenses').delete().in('id', deletedExpenseIds);
                }

                if (updates.expenses.length > 0) {
                    const expensesToUpsert = updates.expenses.map(e => ({
                        id: e.id,
                        project_id: id,
                        description: e.description,
                        value: e.value,
                        date: e.date,
                        user_id: e.userId,
                        user_name: e.userName,
                        attachment_url: e.attachmentUrl,
                        attachments: e.attachments,
                        macro_id: e.macroId || null,
                        sub_macro_id: e.subMacroId || null
                    }));
                    const { error } = await supabase.from('expenses').upsert(expensesToUpsert, { onConflict: 'id' });
                    if (error) throw error;
                }
            }

            // 4. Logs
            if (updates.logs) {
                const projectLogs = currentProject?.logs || [];
                const logsToInsert = updates.logs
                    .filter(l => !projectLogs.find(existing => existing.id === l.id))
                    .map(l => ({
                        id: l.id,
                        project_id: id,
                        user_id: l.userId,
                        user_name: l.userName,
                        action: l.action,
                        field: l.field,
                        old_value: l.oldValue,
                        new_value: l.newValue,
                        timestamp: l.timestamp
                    }));
                if (logsToInsert.length > 0) {
                    await supabase.from('logs').insert(logsToInsert);
                }
            }

            // 5. Documents (Diffing)
            if (updates.documents !== undefined) {
                const currentDocIds = currentProject?.documents.map(d => d.id) || [];
                const newDocIds = updates.documents.map(d => d.id);
                const deletedDocIds = currentDocIds.filter(did => !newDocIds.includes(did));

                if (deletedDocIds.length > 0) {
                    await supabase.from('documents').delete().in('id', deletedDocIds);
                }

                if (updates.documents.length > 0) {
                    const docsToUpsert = updates.documents.map(d => ({
                        id: d.id,
                        project_id: id,
                        title: d.title,
                        category: d.category,
                        url: d.url,
                        created_at: d.createdAt
                    }));
                    await supabase.from('documents').upsert(docsToUpsert, { onConflict: 'id' });
                }
            }

            // 6. Diary (Diffing)
            if (updates.diary !== undefined) {
                const currentEntryIds = currentProject?.diary.map(d => d.id) || [];
                const newEntryIds = updates.diary.map(d => d.id);
                const deletedEntryIds = currentEntryIds.filter(did => !newEntryIds.includes(did));

                if (deletedEntryIds.length > 0) {
                    await supabase.from('diary_entries').delete().in('id', deletedEntryIds);
                }

                if (updates.diary.length > 0) {
                    const entriesToUpsert = updates.diary.map(d => ({
                        id: d.id,
                        project_id: id,
                        date: d.date,
                        content: d.content,
                        photos: d.photos,
                        author: d.author,
                        created_at: d.createdAt,
                        // Note: userId is generally not in Diary entry type locally but is in DB?
                        // Assuming author is enough or we rely on backend trigger/default
                    }));
                    await supabase.from('diary_entries').upsert(entriesToUpsert, { onConflict: 'id' });
                }
            }

            // 7. Stage Evidence
            if (updates.stageEvidence && updates.stageEvidence.length > 0) {
                const evidencesToUpsert = updates.stageEvidence.map(e => ({
                    project_id: id,
                    stage: e.stage,
                    photos: e.photos,
                    notes: e.notes,
                    user_name: e.user,
                    date: e.date
                }));
                await supabase.from('stage_evidences').upsert(evidencesToUpsert, { onConflict: 'project_id, stage' });
            }

            if (logMsg && user) {
                await supabase.from('logs').insert([{
                    id: generateId(),
                    project_id: id,
                    user_id: user.id,
                    user_name: user.name,
                    action: 'Alteração',
                    field: 'Geral',
                    old_value: 'vários',
                    new_value: logMsg
                }]);
            }

            return { id, updates };
        },
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);

            queryClient.setQueryData<Project[]>(['projects'], (old) => {
                return old?.map(p => p.id === id ? { ...p, ...updates } : p) || [];
            });

            return { previousData: previousProjects };
        },
        onError: (err, variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['projects'], context.previousData);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        },
    });
};

export const useDeleteProject = () => {
    const queryClient = useQueryClient();

    return useOfflineMutation({
        mutationFn: async (projectId: string) => {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', projectId);
            if (error) throw error;
            return projectId;
        },
        onMutate: async (projectId) => {
            await queryClient.cancelQueries({ queryKey: ['projects'] });
            const previousProjects = queryClient.getQueryData<Project[]>(['projects']);
            queryClient.setQueryData<Project[]>(['projects'], (old) => old?.filter(p => p.id !== projectId) || []);
            return { previousProjects };
        },
        onError: (err, variables, context) => {
            if (context?.previousProjects) queryClient.setQueryData(['projects'], context.previousProjects);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};
