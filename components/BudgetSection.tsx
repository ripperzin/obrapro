
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Project, ProjectBudget, ProjectMacro, TemplateMacro, CostTemplate, ProjectItem } from '../types';
import { supabase } from '../supabaseClient';
import { formatCurrencyAbbrev } from '../utils'; // Import added
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import { usePlan } from './PlanProvider';
import { computeScheduleDates } from '../utils/schedule';

interface BudgetSectionProps {
    project: Project;
    isAdmin: boolean;
    onBudgetUpdate?: () => void;
}

const DEFAULT_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Helper: cria as ETAPAS (macros) da obra a partir do template padrão.
// O Previsto por item (project_stage_items) é semeado à parte via a RPC
// seed_project_stage_items depois que as etapas existem (ver fetchBudgetData).
/**
 * CONSERTO de orçamento que ficou sem etapas. NÃO usar depois de criar o
 * orçamento: quem semeia as etapas é o gatilho do banco (handle_new_project_budget,
 * que roda sozinho no INSERT de project_budgets). Chamar isto ali semeava tudo
 * DE NOVO — 9 etapas viravam 18 e o Previsto dobrava (obra de R$ 300.000
 * aparecia com R$ 600.000 orçados).
 *
 * `time_based` tem que vir junto: é ela que diz que a etapa é um custo que corre
 * o tempo todo (canteiro, água, luz) e por isso NÃO entra na régua do avanço.
 * Sem copiar essa coluna, o Canteiro voltava para a régua.
 */
const populateBudgetFromTemplate = async (budgetId: string, totalValue: number) => {
    const { data: tMacros } = await supabase
        .from('template_macros')
        .select('*')
        .eq('template_id', DEFAULT_TEMPLATE_ID);

    if (tMacros && tMacros.length > 0) {
        for (const tm of tMacros) {
            const estimatedVal = (totalValue * tm.percentage) / 100;
            await supabase
                .from('project_macros')
                .insert({
                    budget_id: budgetId,
                    name: tm.name,
                    percentage: tm.percentage,
                    estimated_value: estimatedVal,
                    spent_value: 0,
                    display_order: tm.display_order,
                    time_based: tm.time_based ?? false
                });
        }
        return true;
    }
    return false;
};

const BudgetSection: React.FC<BudgetSectionProps> = ({ project, isAdmin, onBudgetUpdate }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [budget, setBudget] = useState<ProjectBudget | null>(null);
    const [macros, setMacros] = useState<ProjectMacro[]>([]);
    const [templateMacros, setTemplateMacros] = useState<TemplateMacro[]>([]);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [totalEstimated, setTotalEstimated] = useState(0);
    const [expandedMacroId, setExpandedMacroId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editMacros, setEditMacros] = useState<ProjectMacro[]>([]);
    const [viewMode, setViewMode] = useState<'stage' | 'item'>('stage'); // "Por etapa" x "Por item"
    const { ent, openUpgrade } = usePlan();
    const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
    // Previsto por item dentro da etapa (project_stage_items): {macroId,itemId,percentage}
    const [stageRows, setStageRows] = useState<{ macroId: string; itemId: string; percentage: number }[]>([]);
    const [editStageRows, setEditStageRows] = useState<{ macroId: string; itemId: string; percentage: number }[]>([]);

    const modalRoot = document.getElementById('modal-root');

    // Sync isEditing with URL action
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') === 'edit-budget' && !isEditing) {
            setIsEditing(true);
        }
    }, []);

    const handleSetIsEditing = (value: boolean) => {
        const params = new URLSearchParams(window.location.search);
        if (value) {
            params.set('action', 'edit-budget');
        } else {
            params.delete('action');
        }
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
        setIsEditing(value);
    };

    // Carregar dados do orçamento - Watch units length/cost to trigger auto-create
    useEffect(() => {
        fetchBudgetData();
        fetchTemplateMacros();
    }, [project.id, project.units.length, project.units.reduce((sum, u) => sum + u.cost, 0)]);

    // Itens da obra (para o modo "Por item" — mapear item_id → nome)
    useEffect(() => {
        const fetchItems = async () => {
            const { data } = await supabase
                .from('project_items')
                .select('id, name, display_order')
                .eq('project_id', project.id)
                .order('display_order');
            if (data) {
                setProjectItems(data.map(it => ({
                    id: it.id, projectId: project.id, name: it.name, displayOrder: it.display_order
                })));
            }
        };
        fetchItems();
    }, [project.id]);

    // Inicializar estado de edição quando entrar no modo edição
    useEffect(() => {
        if (isEditing) {
            setEditMacros([...macros]);
            setEditStageRows(stageRows.map(r => ({ ...r })));
        }
    }, [isEditing, macros, stageRows]);

    // Recarrega só o Previsto por item (sem re-semear), depois de add/remover item.
    const reloadStageItems = async () => {
        const { data } = await supabase
            .from('project_stage_items')
            .select('macro_id, item_id, percentage')
            .eq('project_id', project.id);
        if (data) {
            const rows = data.map((r: any) => ({ macroId: r.macro_id, itemId: r.item_id, percentage: r.percentage }));
            setStageRows(rows);
            setEditStageRows(rows.map(r => ({ ...r })));
        }
    };

    // Edita o % do item na etapa (local); salva no blur.
    const handleUpdateStageItemLocal = (macroId: string, itemId: string, pct: number) => {
        setEditStageRows(prev => prev.map(r =>
            (r.macroId === macroId && r.itemId === itemId) ? { ...r, percentage: pct } : r
        ));
    };
    const handleSaveStageItemPct = async (macroId: string, itemId: string, pct: number) => {
        try {
            const { error } = await supabase
                .from('project_stage_items')
                .update({ percentage: pct })
                .eq('project_id', project.id).eq('macro_id', macroId).eq('item_id', itemId);
            if (error) throw error;
            setStageRows(prev => prev.map(r =>
                (r.macroId === macroId && r.itemId === itemId) ? { ...r, percentage: pct } : r
            ));
        } catch (e) {
            console.error('Erro ao salvar % do item:', e);
            alert('Erro ao salvar o previsto do item.');
        }
    };
    // Adiciona um item ao previsto da etapa (nasce com 0% — não mexe nos outros).
    const handleAddStageItem = async (macroId: string, itemId: string) => {
        if (!itemId) return;
        try {
            const { error } = await supabase
                .from('project_stage_items')
                .insert({ project_id: project.id, macro_id: macroId, item_id: itemId, percentage: 0, display_order: 99 });
            if (error) throw error;
            await reloadStageItems();
        } catch (e) {
            console.error('Erro ao adicionar item na etapa:', e);
            alert('Erro ao adicionar item. Pode já estar na etapa.');
        }
    };
    const handleRemoveStageItem = async (macroId: string, itemId: string) => {
        try {
            const { error } = await supabase
                .from('project_stage_items')
                .delete()
                .eq('project_id', project.id).eq('macro_id', macroId).eq('item_id', itemId);
            if (error) throw error;
            await reloadStageItems();
        } catch (e) {
            console.error('Erro ao remover item da etapa:', e);
        }
    };

    const fetchBudgetData = async (background = false) => {
        if (!background) setLoading(true);
        try {
            // 1. Calcular total real baseado nas unidades cadastradas
            const totalUnitsValue = project.units.reduce((sum, unit) => sum + unit.cost, 0);

            // 2. Buscar orçamento existente
            let { data: budgetData } = await supabase
                .from('project_budgets')
                .select('*')
                .eq('project_id', project.id)
                .single();

            // Se não existir, criar (fluxo automático inicial).
            // Cai aqui quem abriu a obra SEM casas (useCreateObra só cria o orçamento
            // quando já há custo) e cadastrou as casas depois.
            if (!budgetData && totalUnitsValue > 0) {
                console.log('⚡ Criando orçamento padrão automaticamente...');

                // 1. Create Budget Header
                const { data: newBudget, error: createError } = await supabase
                    .from('project_budgets')
                    .insert({
                        project_id: project.id,
                        total_estimated: totalUnitsValue,
                        template_id: DEFAULT_TEMPLATE_ID
                    })
                    .select()
                    .single();

                if (!createError && newBudget) {
                    // As etapas JÁ vêm semeadas: o gatilho handle_new_project_budget roda
                    // dentro deste INSERT. Semear aqui de novo dobrava tudo (9 -> 18
                    // etapas, Previsto em dobro). A busca das macros logo abaixo já as
                    // encontra. Mesmo caminho do useCreateObra, que também confia no gatilho.
                    budgetData = newBudget;
                }
            }

            if (budgetData) {
                // 3. Verificação de Sincronia: Unidades vs Orçamento
                // Se houver diferença significativa (> 1 real), atualizar e recalcular
                if (Math.abs(budgetData.total_estimated - totalUnitsValue) > 1) {
                    console.log(`⚡ Sincronizando Orçamento: R$ ${budgetData.total_estimated} -> R$ ${totalUnitsValue}`);

                    // Atualizar Total do Orçamento
                    await supabase
                        .from('project_budgets')
                        .update({ total_estimated: totalUnitsValue })
                        .eq('id', budgetData.id);

                    budgetData.total_estimated = totalUnitsValue; // Atualizar localmente

                    // Recalcular valores das Macros existentes
                    const { data: currentMacros } = await supabase
                        .from('project_macros')
                        .select('*')
                        .eq('budget_id', budgetData.id);

                    if (currentMacros && currentMacros.length > 0) {
                        for (const macro of currentMacros) {
                            const newEstimatedValue = (totalUnitsValue * macro.percentage) / 100;
                            await supabase
                                .from('project_macros')
                                .update({ estimated_value: newEstimatedValue })
                                .eq('id', macro.id);
                        }
                        // Notificar atualização global se a prop existir
                        onBudgetUpdate?.();
                    }
                }

                setBudget({
                    id: budgetData.id,
                    projectId: budgetData.project_id,
                    totalEstimated: budgetData.total_estimated,
                    templateId: budgetData.template_id,
                    createdAt: budgetData.created_at
                });
                setTotalEstimated(budgetData.total_estimated); // Atualizar estado do input (agora readonly)

                // 4. Buscar macros e subs (fluxo normal)
                let { data: macrosData } = await supabase
                    .from('project_macros')
                    .select('*')
                    .eq('budget_id', budgetData.id)
                    .order('display_order');

                // RETROACTIVE FIX: Se existir orçamento mas SEM macros, popular agora
                if ((!macrosData || macrosData.length === 0)) {
                    console.log('⚡ Reparando orçamento vazio...');
                    const success = await populateBudgetFromTemplate(budgetData.id, totalUnitsValue);
                    if (success) {
                        // Refetch macros
                        const { data: refetched } = await supabase
                            .from('project_macros')
                            .select('*')
                            .eq('budget_id', budgetData.id)
                            .order('display_order');
                        macrosData = refetched;
                        onBudgetUpdate?.();
                    }
                }

                if (macrosData) {
                    setMacros(macrosData.map(m => ({
                        id: m.id,
                        budgetId: m.budget_id,
                        name: m.name,
                        percentage: m.percentage,
                        estimatedValue: m.estimated_value,
                        spentValue: m.spent_value || 0,
                        displayOrder: m.display_order,
                        plannedStartDate: m.planned_start_date,
                        plannedEndDate: m.planned_end_date,
                        timeBased: m.time_based || false
                    })));
                }

                // Previsto por item da etapa: garante a semeadura (idempotente) e lê.
                await supabase.rpc('seed_project_stage_items', { p_project_id: project.id });
                const { data: stageData } = await supabase
                    .from('project_stage_items')
                    .select('macro_id, item_id, percentage')
                    .eq('project_id', project.id);
                if (stageData) {
                    setStageRows(stageData.map((r: any) => ({
                        macroId: r.macro_id, itemId: r.item_id, percentage: r.percentage
                    })));
                }
            }
        } catch (error) {
            console.error('Erro ao carregar/sincronizar orçamento:', error);
        }
        setLoading(false);
    };

    const fetchTemplateMacros = async () => {
        try {
            const { data } = await supabase
                .from('template_macros')
                .select('*')
                .eq('template_id', DEFAULT_TEMPLATE_ID)
                .order('display_order');

            if (data) {
                setTemplateMacros(data.map(m => ({
                    id: m.id,
                    templateId: m.template_id,
                    name: m.name,
                    percentage: m.percentage,
                    materialsHint: m.materials_hint,
                    laborHint: m.labor_hint,
                    displayOrder: m.display_order
                })));
            }
        } catch (error) {
            console.error('Erro ao carregar template:', error);
        }
    };

    // --- CRUD Operations ---

    // 1. Update existing macro
    const handleSaveMacroUpdate = async (macro: ProjectMacro) => {
        try {
            const { error } = await supabase
                .from('project_macros')
                .update({
                    name: macro.name,
                    percentage: macro.percentage,
                    estimated_value: (budget?.totalEstimated || 0) * (macro.percentage / 100),
                    planned_start_date: macro.plannedStartDate,
                    planned_end_date: macro.plannedEndDate
                })
                .eq('id', macro.id);

            if (error) throw error;
            fetchBudgetData(true);
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao atualizar macro:', error);
            alert('Erro ao salvar alteração da macro');
        }
    };

    // Cronograma automático: distribui as datas das etapas entre o início e a entrega
    // da obra, proporcional ao peso (%) de cada etapa — a mesma fonte do avanço.
    const handleGenerateSchedule = async () => {
        if (!project.startDate || !project.deliveryDate) {
            alert('Defina a data de início e a de entrega da obra (na aba Gestão) para gerar o cronograma automaticamente.');
            return;
        }
        const updates = computeScheduleDates(macros, project.startDate, project.deliveryDate);
        if (updates.length === 0) {
            alert('A data de entrega precisa ser posterior à data de início.');
            return;
        }

        const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
        const corridas = macros.filter(m => m.timeBased);
        if (!window.confirm(
            `Gerar as datas das ${macros.length} etapas de ${fmt(project.startDate)} a ${fmt(project.deliveryDate)}, ` +
            `distribuindo pelo peso (%) de cada etapa?` +
            (corridas.length > 0
                ? `\n\n${corridas.map(m => m.name).join(', ')} corre${corridas.length > 1 ? 'm' : ''} do início à entrega (é custo do tempo, não uma fase).`
                : '') +
            `\n\nIsto substitui as datas planejadas atuais.`
        )) return;
        try {
            await Promise.all(updates.map(u =>
                supabase.from('project_macros')
                    .update({ planned_start_date: u.planned_start_date, planned_end_date: u.planned_end_date })
                    .eq('id', u.id)
            ));
            fetchBudgetData(true);
            onBudgetUpdate?.();
            alert('Cronograma gerado! Ajuste as datas de cada etapa aqui se precisar, ou veja no botão "Cronograma" da obra.');
        } catch (e: any) {
            alert('Erro ao gerar cronograma: ' + (e.message || e));
        }
    };

    const handleUpdateMacroLocal = (id: string, field: keyof ProjectMacro, value: any) => {
        setEditMacros(prev => prev.map(m => {
            if (m.id === id) {
                return { ...m, [field]: value };
            }
            return m;
        }));
    };

    // 2. Add new macro
    const handleAddMacro = async () => {
        if (!budget) return;
        try {
            const { error } = await supabase
                .from('project_macros')
                .insert({
                    budget_id: budget.id,
                    name: 'Nova Categoria',
                    percentage: 0,
                    estimated_value: 0,
                    spent_value: 0,
                    display_order: editMacros.length + 1
                });

            if (error) throw error;
            fetchBudgetData(true);
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao adicionar macro:', error);
        }
    };

    // 3. Delete macro
    const handleDeleteMacro = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja remover esta categoria? As despesas vinculadas ficarão "Sem Categoria".')) return;
        try {
            // 1. Desvincular despesas (setar macro_id e sub_macro_id = null)
            const { error: updateError } = await supabase
                .from('expenses')
                .update({ macro_id: null, sub_macro_id: null })
                .eq('macro_id', id);

            if (updateError) throw updateError;

            // 2. Deletar sub-macros vinculadas (opcional se tiver cascade, mas garantindo)
            await supabase.from('project_sub_macros').delete().eq('project_macro_id', id);

            // 3. Deletar a macro
            const { error } = await supabase.from('project_macros').delete().eq('id', id);

            if (error) throw error;
            fetchBudgetData(true);
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao remover macro:', error);
            alert('Erro ao remover categoria. Tente novamente.');
        }
    };

    const handleCreateBudget = async () => {
        if (totalEstimated <= 0) return;

        setSaving(true);
        try {
            // 1. Criar orçamento
            const { data: newBudget, error: budgetError } = await supabase
                .from('project_budgets')
                .insert({
                    project_id: project.id,
                    total_estimated: totalEstimated,
                    template_id: DEFAULT_TEMPLATE_ID
                })
                .select()
                .single();

            if (budgetError) throw budgetError;

            // 2. Criar as ETAPAS (macros) baseadas no template.
            // O Previsto por item é semeado depois via seed_project_stage_items (fetchBudgetData).
            for (const tm of templateMacros) {
                const estimatedVal = (totalEstimated * tm.percentage) / 100;
                const { error: macroError } = await supabase
                    .from('project_macros')
                    .insert({
                        budget_id: newBudget.id,
                        name: tm.name,
                        percentage: tm.percentage,
                        estimated_value: estimatedVal,
                        spent_value: 0,
                        display_order: tm.displayOrder
                    });
                if (macroError) throw macroError;
            }

            setShowSetupModal(false);
            fetchBudgetData(true);
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao criar orçamento:', error);
            alert('Erro ao criar orçamento');
        }
        setSaving(false);
    };

    // Calcular total gasto
    const totalSpent = macros.reduce((sum, m) => sum + m.spentValue, 0);
    const totalBudget = budget?.totalEstimated || 0;
    const overallProgress = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // ── Modo "Por item": os 2 espelhos (pra onde o dinheiro foi) ─────────────────
    const itemNameById = React.useMemo(() => {
        const m: Record<string, string> = {};
        projectItems.forEach(it => { m[it.id] = it.name; });
        return m;
    }, [projectItems]);
    const macroNameById = React.useMemo(() => {
        const m: Record<string, string> = {};
        macros.forEach(mc => { m[mc.id] = mc.name; });
        return m;
    }, [macros]);
    const SEM_ITEM = 'Sem item';
    const SEM_ETAPA = 'Sem etapa';

    // Real por (etapa, item): soma das despesas. Chave `${macroId}|${itemId}` ('' = sem item).
    const realByMacroItem = React.useMemo(() => {
        const m: Record<string, number> = {};
        (project.expenses || []).forEach(e => {
            if (!e.macroId) return;
            const key = `${e.macroId}|${e.itemId || ''}`;
            m[key] = (m[key] || 0) + (e.value || 0);
        });
        return m;
    }, [project.expenses]);

    // Drill-down de uma etapa: itens Previstos (com Real) + itens "fora do previsto".
    const macroDrilldown = (macro: ProjectMacro) => {
        const planned = stageRows
            .filter(r => r.macroId === macro.id)
            .map(r => ({
                itemId: r.itemId,
                name: itemNameById[r.itemId] || '—',
                previsto: macro.estimatedValue * (r.percentage / 100),
                real: realByMacroItem[`${macro.id}|${r.itemId}`] || 0,
            }))
            .sort((a, b) => b.previsto - a.previsto);
        const plannedIds = new Set(planned.map(p => p.itemId));
        const unplannedMap: Record<string, number> = {};
        (project.expenses || []).forEach(e => {
            if (e.macroId !== macro.id) return;
            if (e.itemId && plannedIds.has(e.itemId)) return; // já está no previsto
            const label = (e.itemId && itemNameById[e.itemId]) || SEM_ITEM;
            unplannedMap[label] = (unplannedMap[label] || 0) + (e.value || 0);
        });
        const unplanned = Object.entries(unplannedMap)
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);
        return { planned, unplanned };
    };

    // Espelho 1: total gasto por item (no que mais gastei), ranqueado.
    const spentByItem = React.useMemo(() => {
        const acc: Record<string, number> = {};
        (project.expenses || []).forEach(e => {
            const label = (e.itemId && itemNameById[e.itemId]) || SEM_ITEM;
            acc[label] = (acc[label] || 0) + (e.value || 0);
        });
        return Object.entries(acc)
            .map(([name, total]) => ({ name, total }))
            .sort((a, b) => b.total - a.total);
    }, [project.expenses, itemNameById]);
    const spentByItemTotal = spentByItem.reduce((s, r) => s + r.total, 0);
    const spentByItemMax = spentByItem.reduce((m, r) => Math.max(m, r.total), 0);

    // Espelho 2: por etapa, do que ela foi feita (itens dentro da etapa).
    const stageBreakdown = React.useMemo(() => {
        const byMacro: Record<string, { total: number; items: Record<string, number> }> = {};
        (project.expenses || []).forEach(e => {
            const macroLabel = (e.macroId && macroNameById[e.macroId]) || SEM_ETAPA;
            const itemLabel = (e.itemId && itemNameById[e.itemId]) || SEM_ITEM;
            if (!byMacro[macroLabel]) byMacro[macroLabel] = { total: 0, items: {} };
            byMacro[macroLabel].total += (e.value || 0);
            byMacro[macroLabel].items[itemLabel] = (byMacro[macroLabel].items[itemLabel] || 0) + (e.value || 0);
        });
        // ordena etapas pela ordem do orçamento; "Sem etapa" por último
        const order = (name: string) => {
            const mc = macros.find(m => m.name === name);
            return mc ? mc.displayOrder : 9999;
        };
        return Object.entries(byMacro)
            .map(([name, data]) => ({
                name,
                total: data.total,
                items: Object.entries(data.items)
                    .map(([iname, total]) => ({ name: iname, total }))
                    .sort((a, b) => b.total - a.total)
            }))
            .sort((a, b) => order(a.name) - order(b.name));
    }, [project.expenses, itemNameById, macroNameById, macros]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!budget) {
        return (
            <div className="space-y-6">
                <div className="glass rounded-3xl p-8 text-center">
                    <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i className="fa-solid fa-chart-pie text-4xl text-blue-400"></i>
                    </div>
                    <h3 className="text-xl font-black text-white mb-2">Configure o Orçamento</h3>
                    <p className="text-slate-400 mb-6 max-w-md mx-auto">
                        Defina o valor total estimado da obra e acompanhe os gastos por categoria (macro-despesas).
                    </p>
                    {isAdmin && (
                        <button
                            onClick={() => setShowSetupModal(true)}
                            className="px-8 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition font-bold shadow-lg shadow-blue-600/30 flex items-center gap-3 mx-auto"
                        >
                            <i className="fa-solid fa-plus"></i>
                            Configurar Orçamento
                        </button>
                    )}
                </div>

                {showSetupModal && modalRoot && ReactDOM.createPortal(
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                        <div className="glass rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-700">
                            <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                                <h2 className="text-xl font-black text-white">Configurar Orçamento</h2>
                                <button
                                    onClick={() => setShowSetupModal(false)}
                                    className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition"
                                >
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center justify-between">
                                        <span>Valor Total Estimado da Obra</span>
                                        <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <i className="fa-solid fa-lock text-[8px]"></i> Automático
                                        </span>
                                    </label>
                                    <MoneyInput
                                        value={totalEstimated}
                                        onBlur={(val) => { }} // Desabilitado
                                        disabled={true} // Desabilitado
                                        className="w-full px-6 py-4 bg-slate-900 border-2 border-slate-700/50 rounded-2xl outline-none font-black text-slate-500 text-xl text-center cursor-not-allowed"
                                    />
                                    <p className="text-xs text-slate-500 text-center">
                                        Calculado automaticamente com base na soma das unidades.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Distribuição por Categoria (Template Padrão)
                                    </label>
                                    <div className="bg-slate-800/50 rounded-2xl p-4 max-h-64 overflow-y-auto space-y-2">
                                        {templateMacros.map(tm => (
                                            <div key={tm.id} className="flex justify-between items-center py-2 border-b border-slate-700/50 last:border-0">
                                                <span className="text-white font-medium">{tm.name}</span>
                                                <div className="text-right">
                                                    <span className="text-blue-400 font-bold">{tm.percentage}%</span>
                                                    {totalEstimated > 0 && (
                                                        <span className="text-slate-500 text-sm ml-2">
                                                            ({formatCurrency((totalEstimated * tm.percentage) / 100)})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={handleCreateBudget}
                                    disabled={saving || totalEstimated <= 0}
                                    className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fa-solid fa-check"></i>
                                            Confirmar Orçamento
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>,
                    modalRoot
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="glass rounded-3xl p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-black text-white">Controle de Orçamento</h3>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${overallProgress > 100 ? 'bg-red-500/20 text-red-400' :
                        overallProgress > 80 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                        }`}>
                        {overallProgress.toFixed(0)}% utilizado
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Orçamento</p>
                        <p className="text-white font-black text-lg">R$ {formatCurrencyAbbrev(totalBudget)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Gasto</p>
                        <p className="text-blue-400 font-black text-lg">R$ {formatCurrencyAbbrev(totalSpent)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Saldo</p>
                        <p className={`font-black text-lg ${totalBudget - totalSpent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            R$ {formatCurrencyAbbrev(totalBudget - totalSpent)}
                        </p>
                    </div>
                </div>

                <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${overallProgress > 100 ? 'bg-red-500' :
                            overallProgress > 80 ? 'bg-yellow-500' :
                                'bg-green-500'
                            }`}
                        style={{ width: `${Math.min(overallProgress, 100)}%` }}
                    />
                </div>
            </div>

            <div className="space-y-3">
                {/* Alternância Por etapa / Por item */}
                <div className="flex bg-slate-800/50 rounded-full p-1 w-fit">
                    <button
                        onClick={() => setViewMode('stage')}
                        className={`px-4 py-1.5 rounded-full text-xs font-black transition ${viewMode === 'stage' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        <i className="fa-solid fa-layer-group mr-2"></i>Por etapa
                    </button>
                    {/* "Por item" é do plano ObraPro. No Free o botão CONTINUA à
                        vista, com cadeado — é a vitrine do que ele ganha. */}
                    <button
                        onClick={() => {
                            if (!ent.canUseItens) { openUpgrade('itens'); return; }
                            setViewMode('item');
                            if (isEditing) handleSetIsEditing(false);
                        }}
                        className={`px-4 py-1.5 rounded-full text-xs font-black transition ${viewMode === 'item' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        <i className={`fa-solid ${ent.canUseItens ? 'fa-boxes-stacked' : 'fa-lock text-amber-400'} mr-2`}></i>Por item
                    </button>
                </div>

                {viewMode === 'stage' && (
                <div className="flex justify-between items-center px-2">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                        Por Categoria
                    </h4>
                    {isAdmin && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleGenerateSchedule}
                                title="Distribui as datas das etapas entre o início e a entrega da obra (pelo peso de cada etapa)"
                                className="text-xs font-bold px-3 py-1 rounded-full border transition bg-blue-600/10 text-blue-400 border-blue-500/40 hover:bg-blue-600 hover:text-white"
                            >
                                <i className="fa-solid fa-wand-magic-sparkles mr-2"></i>
                                Gerar cronograma
                            </button>
                            <button
                                onClick={() => handleSetIsEditing(!isEditing)}
                                className={`text-xs font-bold px-3 py-1 rounded-full border transition ${isEditing
                                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50'
                                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                                    }`}
                            >
                                <i className={`fa-solid ${isEditing ? 'fa-check' : 'fa-gear'} mr-2`}></i>
                                {isEditing ? 'Concluir Edição' : 'Personalizar'}
                            </button>
                        </div>
                    )}
                </div>
                )}

                {viewMode === 'stage' ? (
                  <>
                {/* Rótulo honesto: o preset é ponto de partida, não verdade. */}
                <div className="flex items-start gap-2 text-[11px] text-slate-500 px-2 -mt-1">
                    <i className="fa-solid fa-circle-info mt-0.5 text-slate-600"></i>
                    <span>Distribuição <b className="text-slate-400">sugerida</b> (base em obras residenciais econômicas). Ajuste em <b className="text-slate-400">Personalizar</b> conforme seu projeto, região e método construtivo.</span>
                </div>
                {isEditing && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4 animate-fade-in">
                        <div className="flex items-start gap-3">
                            <i className="fa-solid fa-triangle-exclamation text-yellow-400 mt-1"></i>
                            <div>
                                <h5 className="text-sm font-bold text-yellow-400 mb-1">Modo de Personalização</h5>
                                <p className="text-xs text-yellow-400/80 mb-2">
                                    Ajuste o <b>% de cada etapa</b> (a régua do orçamento) e o <b>previsto de cada item dentro da etapa</b>. Os valores em R$ recalculam sozinhos. São só um ponto de partida — mude à vontade.
                                </p>
                                <div className="text-xs font-mono bg-black/20 rounded px-2 py-1 inline-block">
                                    Soma das etapas: <span className={editMacros.reduce((acc, m) => acc + m.percentage, 0) === 100 ? 'text-green-400' : 'text-red-400'}>
                                        {editMacros.reduce((acc, m) => acc + m.percentage, 0).toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isEditing ? (
                    <div className="space-y-4">
                        {editMacros.map(macro => (
                            <div key={macro.id} className="glass rounded-2xl p-4 border border-blue-500/30 animate-fade-in">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-12 gap-3 items-center">
                                        <div className="col-span-1 flex justify-center">
                                            <button
                                                onClick={() => handleDeleteMacro(macro.id)}
                                                className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 flex items-center justify-center transition"
                                            >
                                                <i className="fa-solid fa-trash text-xs"></i>
                                            </button>
                                        </div>
                                        <div className="col-span-11 md:col-span-5">
                                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Nome da Categoria</label>
                                            <input
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-blue-500"
                                                value={macro.name}
                                                onChange={(e) => handleUpdateMacroLocal(macro.id, 'name', e.target.value)}
                                                onBlur={() => handleSaveMacroUpdate(macro)}
                                            />
                                        </div>
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Percentual (%)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-blue-500 pl-3 pr-6"
                                                    value={macro.percentage}
                                                    onChange={(e) => handleUpdateMacroLocal(macro.id, 'percentage', parseFloat(e.target.value) || 0)}
                                                    onBlur={() => handleSaveMacroUpdate(macro)}
                                                />
                                                <span className="absolute right-3 top-2 text-slate-500 text-sm font-bold">%</span>
                                            </div>
                                        </div>
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Início Previsto</label>
                                            <DateInput
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-blue-500"
                                                value={macro.plannedStartDate}
                                                onBlur={(val) => {
                                                    handleUpdateMacroLocal(macro.id, 'plannedStartDate', val);
                                                    handleSaveMacroUpdate({ ...macro, plannedStartDate: val });
                                                }}
                                            />
                                        </div>
                                        <div className="col-span-6 md:col-span-2">
                                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Fim Previsto</label>
                                            <DateInput
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-blue-500"
                                                value={macro.plannedEndDate}
                                                onBlur={(val) => {
                                                    handleUpdateMacroLocal(macro.id, 'plannedEndDate', val);
                                                    handleSaveMacroUpdate({ ...macro, plannedEndDate: val });
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {(() => {
                                        const rows = editStageRows
                                            .filter(r => r.macroId === macro.id)
                                            .sort((a, b) => b.percentage - a.percentage);
                                        const usados = new Set(rows.map(r => r.itemId));
                                        const disponiveis = projectItems.filter(pi => !usados.has(pi.id));
                                        const soma = rows.reduce((s, r) => s + r.percentage, 0);
                                        return (
                                    <div className="pl-12 pr-1 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                Itens previstos <span className={`ml-1 ${Math.round(soma) === 100 ? 'text-green-400' : 'text-amber-400'}`}>({soma.toFixed(0)}%)</span>
                                            </p>
                                            <select
                                                value=""
                                                onChange={(e) => { if (e.target.value) handleAddStageItem(macro.id, e.target.value); }}
                                                className="text-[10px] font-bold text-blue-400 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[45%]"
                                            >
                                                <option value="">+ Adicionar item…</option>
                                                {disponiveis.map(pi => (
                                                    <option key={pi.id} value={pi.id}>{pi.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {rows.length === 0 && (
                                            <p className="text-[10px] text-slate-600 italic">Nenhum item previsto nesta etapa. Adicione um item acima.</p>
                                        )}
                                        {rows.map(row => (
                                            <div key={row.itemId} className="grid grid-cols-12 gap-2 items-center bg-slate-800/30 rounded-lg p-2">
                                                <div className="col-span-1 flex justify-center">
                                                    <i className="fa-solid fa-turn-up rotate-90 text-slate-600 text-[10px]"></i>
                                                </div>
                                                <div className="col-span-7">
                                                    <span className="text-xs font-bold text-slate-300 px-1">{itemNameById[row.itemId] || '—'}</span>
                                                </div>
                                                <div className="col-span-3 relative">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent border-b border-transparent focus:border-slate-600 px-1 py-0.5 text-xs font-bold text-slate-300 outline-none text-right pr-4"
                                                        value={row.percentage}
                                                        onChange={(e) => handleUpdateStageItemLocal(macro.id, row.itemId, parseFloat(e.target.value) || 0)}
                                                        onBlur={() => handleSaveStageItemPct(macro.id, row.itemId, row.percentage)}
                                                    />
                                                    <span className="absolute right-1 top-0.5 text-slate-500 text-[10px]">%</span>
                                                </div>
                                                <div className="col-span-1 flex justify-center">
                                                    <button
                                                        onClick={() => handleRemoveStageItem(macro.id, row.itemId)}
                                                        className="text-slate-600 hover:text-red-400"
                                                    >
                                                        <i className="fa-solid fa-xmark"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        ))}

                        <button
                            onClick={handleAddMacro}
                            className="w-full py-3 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 font-bold hover:bg-slate-800 hover:text-white transition flex items-center justify-center gap-2"
                        >
                            <i className="fa-solid fa-plus-circle"></i> Adicionar Nova Categoria
                        </button>
                    </div>
                ) : (
                    macros.map(macro => {
                        const progress = macro.estimatedValue > 0
                            ? (macro.spentValue / macro.estimatedValue) * 100
                            : 0;

                        return (
                            <div key={macro.id} className="glass rounded-2xl p-4 transition-all hover:bg-slate-800/30 cursor-pointer" onClick={() => setExpandedMacroId(expandedMacroId === macro.id ? null : macro.id)}>
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <i className={`fa-solid fa-chevron-${expandedMacroId === macro.id ? 'down' : 'right'} text-xs text-slate-500`}></i>
                                        <span className="text-white font-bold">{macro.name}</span>
                                    </div>
                                    <span className={`text-sm font-bold ${progress > 100 ? 'text-red-400' :
                                        progress > 80 ? 'text-yellow-400' :
                                            'text-green-400'
                                        }`}>
                                        {progress > 100 && <i className="fa-solid fa-triangle-exclamation mr-1"></i>}
                                        {progress.toFixed(0)}%
                                    </span>
                                </div>

                                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
                                    <div
                                        className={`h-full rounded-full transition-all ${progress > 100 ? 'bg-red-500' :
                                            progress > 80 ? 'bg-yellow-500' :
                                                'bg-blue-500'
                                            }`}
                                        style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                </div>

                                <div className="flex justify-between text-xs text-slate-400">
                                    <span>Gasto: {formatCurrency(macro.spentValue)}</span>
                                    <span>Meta: {formatCurrency(macro.estimatedValue)}</span>
                                </div>

                                {expandedMacroId === macro.id && (() => {
                                    const { planned, unplanned } = macroDrilldown(macro);
                                    return (
                                        <div className="mt-4 pl-4 border-l-2 border-slate-700 space-y-3 animate-fade-in" onClick={e => e.stopPropagation()}>
                                            {planned.length === 0 && unplanned.length === 0 ? (
                                                <p className="text-xs text-slate-600 italic">Sem itens previstos nesta etapa. Lance despesas com item para acompanhar aqui.</p>
                                            ) : (
                                                <>
                                                    {/* Itens previstos: barra Gasto × Previsto */}
                                                    {planned.map(it => {
                                                        const itemProgress = it.previsto > 0 ? (it.real / it.previsto) * 100 : (it.real > 0 ? 100 : 0);
                                                        return (
                                                            <div key={it.itemId} className="text-xs">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="text-slate-300 font-bold">{it.name}</span>
                                                                    <span className={`${itemProgress > 100 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                        {itemProgress > 100 && <i className="fa-solid fa-triangle-exclamation mr-1"></i>}
                                                                        {formatCurrency(it.real)} <span className="text-slate-600">/ {formatCurrency(it.previsto)}</span>
                                                                    </span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${itemProgress > 100 ? 'bg-red-500' : 'bg-blue-400'}`}
                                                                        style={{ width: `${Math.min(itemProgress, 100)}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Itens fora do previsto: só o gasto */}
                                                    {unplanned.length > 0 && (
                                                        <div className="pt-2 mt-1 border-t border-slate-700/50 space-y-2">
                                                            <p className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider">Fora do previsto</p>
                                                            {unplanned.map(it => (
                                                                <div key={it.name} className="flex justify-between items-center text-xs">
                                                                    <span className={`font-bold ${it.name === SEM_ITEM ? 'text-slate-500 italic' : 'text-slate-300'}`}>
                                                                        <i className="fa-solid fa-circle-plus text-amber-400/60 text-[9px] mr-1.5"></i>{it.name}
                                                                    </span>
                                                                    <span className="text-amber-400/90">{formatCurrency(it.total)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })
                )}
                  </>
                ) : (
                  /* ── MODO POR ITEM: os 2 espelhos ── */
                  <div className="space-y-6">
                    {spentByItemTotal === 0 ? (
                      <div className="glass rounded-2xl p-8 text-center">
                        <i className="fa-solid fa-boxes-stacked text-3xl text-slate-600 mb-3"></i>
                        <p className="font-bold text-white mb-1">Ainda sem itens lançados</p>
                        <p className="text-sm text-slate-400 max-w-sm mx-auto">Ao lançar uma despesa, escolha o <b>Item</b> ("o que comprei"). Aqui você vê no que mais gastou e do que cada etapa foi feita.</p>
                      </div>
                    ) : (
                      <>
                        {/* Espelho 1 — no que mais gastou */}
                        <div className="glass rounded-2xl p-5">
                          <h4 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-1">No que você mais gastou</h4>
                          <p className="text-xs text-slate-500 mb-4">Somando todas as despesas, por item.</p>
                          <div className="space-y-3">
                            {spentByItem.map(row => {
                              const pct = spentByItemTotal > 0 ? (row.total / spentByItemTotal) * 100 : 0;
                              const bar = spentByItemMax > 0 ? (row.total / spentByItemMax) * 100 : 0;
                              return (
                                <div key={row.name}>
                                  <div className="flex justify-between items-center mb-1 text-sm">
                                    <span className={`font-bold ${row.name === SEM_ITEM ? 'text-slate-500 italic' : 'text-white'}`}>{row.name}</span>
                                    <span className="text-slate-300 font-bold">{formatCurrency(row.total)} <span className="text-slate-500 text-xs font-normal">· {pct.toFixed(0)}%</span></span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${bar}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Espelho 2 — do que cada etapa foi feita */}
                        <div className="space-y-3">
                          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">Do que cada etapa foi feita</h4>
                          {stageBreakdown.map(stage => (
                            <div key={stage.name} className="glass rounded-2xl p-4">
                              <div className="flex justify-between items-center mb-3">
                                <span className={`font-bold ${stage.name === SEM_ETAPA ? 'text-slate-500 italic' : 'text-white'}`}>{stage.name}</span>
                                <span className="text-blue-400 font-black">{formatCurrency(stage.total)}</span>
                              </div>
                              <div className="space-y-2">
                                {stage.items.map(it => {
                                  const bar = stage.total > 0 ? (it.total / stage.total) * 100 : 0;
                                  return (
                                    <div key={it.name} className="text-xs">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className={`${it.name === SEM_ITEM ? 'text-slate-500 italic' : 'text-slate-300'} font-bold`}>{it.name}</span>
                                        <span className="text-slate-400">{formatCurrency(it.total)} · {bar.toFixed(0)}%</span>
                                      </div>
                                      <div className="w-full h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-blue-400" style={{ width: `${bar}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
            </div>
        </div>
    );
};

export default BudgetSection;
