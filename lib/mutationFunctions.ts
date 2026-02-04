/**
 * Mutation Functions - Standalone functions for offline persistence
 * 
 * These functions are extracted from hooks to allow serialization/rehydration
 * by TanStack Query's persist plugin. Functions cannot be serialized to IndexedDB,
 * so we define them here and register via setMutationDefaults.
 */

import { supabase } from '../supabaseClient';
import { Project, Unit, Expense, Document, DiaryEntry } from '../types';
import { generateId } from '../utils';

// ============================================================================
// PROJECT MUTATIONS
// ============================================================================

export interface CreateProjectInput {
    id?: string;
    name: string;
    userId: string;
    userName: string;
    startDate?: string | null;
    deliveryDate?: string | null;
    unitCount?: number;
    totalArea?: number;
    expectedTotalCost?: number;
    expectedTotalSales?: number;
    progress?: number;
}

export async function createProjectMutationFn(projectData: CreateProjectInput) {
    if (!projectData.userId) {
        throw new Error('ABORT_MISSING_USER: Cannot create project without User ID.');
    }

    const id = projectData.id || generateId();
    const { data, error } = await supabase.from('projects').insert([{
        id: id,
        name: projectData.name,
        user_id: projectData.userId,
        user_name: projectData.userName,
        start_date: projectData.startDate || null,
        delivery_date: projectData.deliveryDate || null,
        unit_count: projectData.unitCount,
        total_area: projectData.totalArea,
        expected_total_cost: projectData.expectedTotalCost,
        expected_total_sales: projectData.expectedTotalSales,
        progress: projectData.progress || 0,
        units: [],
        expenses: [],
        logs: [],
        documents: []
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
}

export interface UpdateProjectInput {
    id: string;
    updates: Partial<Project>;
    logMsg?: string;
    user?: { id: string; name: string };
    // Include current data for diffing
    currentProject?: Project;
}

export async function updateProjectMutationFn(input: UpdateProjectInput) {
    const { id, updates, logMsg, user, currentProject } = input;

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

    // 2. Units (Upsert only - deletion handled by useDeleteUnit)
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
}

export async function deleteProjectMutationFn(projectId: string) {
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);
    if (error) throw error;
    return projectId;
}

// ============================================================================
// UNIT MUTATIONS
// ============================================================================

export interface DeleteUnitInput {
    projectId: string;
    unitId: string;
}

export async function deleteUnitMutationFn({ projectId, unitId }: DeleteUnitInput) {
    const { error } = await supabase.from('units').delete().eq('id', unitId);
    if (error) throw error;
    return { projectId, unitId };
}

// ============================================================================
// EXPENSE MUTATIONS
// ============================================================================

export interface DeleteExpenseInput {
    projectId: string;
    expenseId: string;
}

export async function deleteExpenseMutationFn({ projectId, expenseId }: DeleteExpenseInput) {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
    return { projectId, expenseId };
}

// ============================================================================
// DOCUMENT MUTATIONS
// ============================================================================

export interface DeleteDocumentInput {
    projectId: string;
    documentId: string;
}

export async function deleteDocumentMutationFn({ projectId, documentId }: DeleteDocumentInput) {
    const { error } = await supabase.from('documents').delete().eq('id', documentId);
    if (error) throw error;
    return { projectId, documentId };
}

// ============================================================================
// DIARY MUTATIONS
// ============================================================================

export interface DeleteDiaryEntryInput {
    projectId: string;
    entryId: string;
}

export async function deleteDiaryEntryMutationFn({ projectId, entryId }: DeleteDiaryEntryInput) {
    const { error } = await supabase.from('diary_entries').delete().eq('id', entryId);
    if (error) throw error;
    return { projectId, entryId };
}
