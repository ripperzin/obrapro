
import React, { useState, useEffect } from 'react';
import { Project, ProjectBudget, ProjectMacro, TemplateMacro, CostTemplate, ProjectSubMacro, TemplateSubMacro } from '../types';
import { supabase } from '../supabaseClient';
import MoneyInput from './MoneyInput';

interface BudgetSectionProps {
    project: Project;
    isAdmin: boolean;
    onBudgetUpdate?: () => void;
}

const DEFAULT_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const BudgetSection: React.FC<BudgetSectionProps> = ({ project, isAdmin, onBudgetUpdate }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [budget, setBudget] = useState<ProjectBudget | null>(null);
    const [macros, setMacros] = useState<ProjectMacro[]>([]);
    const [templateMacros, setTemplateMacros] = useState<TemplateMacro[]>([]);
    const [templateSubMacros, setTemplateSubMacros] = useState<TemplateSubMacro[]>([]);
    const [projectSubMacros, setProjectSubMacros] = useState<ProjectSubMacro[]>([]);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [totalEstimated, setTotalEstimated] = useState(0);
    const [expandedMacroId, setExpandedMacroId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editMacros, setEditMacros] = useState<ProjectMacro[]>([]);
    const [editSubMacros, setEditSubMacros] = useState<ProjectSubMacro[]>([]);

    // Carregar dados do orçamento
    useEffect(() => {
        fetchBudgetData();
        fetchTemplateMacros();
    }, [project.id]);

    // Inicializar estado de edição quando entrar no modo edição
    useEffect(() => {
        if (isEditing) {
            setEditMacros([...macros]);
            setEditSubMacros([...projectSubMacros]);
        }
    }, [isEditing, macros, projectSubMacros]);

    const fetchBudgetData = async () => {
        setLoading(true);
        try {
            // 1. Calcular total real baseado nas unidades cadastradas
            const totalUnitsValue = project.units.reduce((sum, unit) => sum + unit.cost, 0);

            // 2. Buscar orçamento existente
            let { data: budgetData } = await supabase
                .from('project_budgets')
                .select('*')
                .eq('project_id', project.id)
                .single();

            // Se não existir, criar (fluxo automático inicial)
            if (!budgetData && totalUnitsValue > 0) {
                const { data: newBudget, error: createError } = await supabase
                    .from('project_budgets')
                    .insert({
                        project_id: project.id,
                        total_estimated: totalUnitsValue,
                        template_id: DEFAULT_TEMPLATE_ID
                    })
                    .select()
                    .single();

                if (!createError) budgetData = newBudget;
            }

            if (budgetData) {
                // 3. Verificação de Sincronia: Unidades vs Orçamento
                // Se houver diferença significativa (> 1 real), atualizar e recalcular
                if (Math.abs(budgetData.total_estimated - totalUnitsValue) > 1 && totalUnitsValue > 0) {
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
                const { data: macrosData } = await supabase
                    .from('project_macros')
                    .select('*')
                    .eq('budget_id', budgetData.id)
                    .order('display_order');

                if (macrosData) {
                    setMacros(macrosData.map(m => ({
                        id: m.id,
                        budgetId: m.budget_id,
                        name: m.name,
                        percentage: m.percentage,
                        estimatedValue: m.estimated_value,
                        spentValue: m.spent_value || 0,
                        displayOrder: m.display_order
                    })));

                    const macroIds = macrosData.map(m => m.id);
                    if (macroIds.length > 0) {
                        const { data: subData } = await supabase
                            .from('project_sub_macros')
                            .select('*')
                            .in('project_macro_id', macroIds)
                            .order('display_order');

                        if (subData) {
                            setProjectSubMacros(subData.map(sm => ({
                                id: sm.id,
                                projectMacroId: sm.project_macro_id,
                                name: sm.name,
                                percentage: sm.percentage,
                                estimatedValue: sm.estimated_value,
                                spentValue: sm.spent_value || 0,
                                displayOrder: sm.display_order
                            })));
                        }
                    }
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

                const macroIds = data.map(m => m.id);
                if (macroIds.length > 0) {
                    const { data: subData } = await supabase
                        .from('template_sub_macros')
                        .select('*')
                        .in('macro_id', macroIds)
                        .order('display_order');

                    if (subData) {
                        setTemplateSubMacros(subData.map(sm => ({
                            id: sm.id,
                            macroId: sm.macro_id,
                            name: sm.name,
                            percentage: sm.percentage,
                            description: sm.description,
                            displayOrder: sm.display_order
                        })));
                    }
                }
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
                    estimated_value: (budget?.totalEstimated || 0) * (macro.percentage / 100)
                })
                .eq('id', macro.id);

            if (error) throw error;
            fetchBudgetData();
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao atualizar macro:', error);
            alert('Erro ao salvar alteração da macro');
        }
    };

    const handleUpdateMacroLocal = (id: string, field: 'name' | 'percentage', value: any) => {
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
            fetchBudgetData();
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
            fetchBudgetData();
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao remover macro:', error);
            alert('Erro ao remover categoria. Tente novamente.');
        }
    };

    // 4. Add sub-macro
    const handleAddSubMacro = async (macroId: string) => {
        try {
            const { error } = await supabase
                .from('project_sub_macros')
                .insert({
                    project_macro_id: macroId,
                    name: 'Novo Subtópico',
                    percentage: 0,
                    estimated_value: 0,
                    spent_value: 0,
                    display_order: 99
                });

            if (error) throw error;
            fetchBudgetData();
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao adicionar sub-macro:', error);
        }
    };

    // 5. Delete sub-macro
    const handleDeleteSubMacro = async (id: string) => {
        if (!window.confirm('Remover este subtópico? As despesas vinculadas ficarão "Sem Detalhe".')) return;
        try {
            // 1. Desvincular despesas (setar sub_macro_id = null)
            const { error: updateError } = await supabase
                .from('expenses')
                .update({ sub_macro_id: null })
                .eq('sub_macro_id', id);

            if (updateError) throw updateError;

            // 2. Deletar o subtópico
            const { error } = await supabase.from('project_sub_macros').delete().eq('id', id);

            if (error) throw error;
            fetchBudgetData();
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao remover sub-macro:', error);
            alert('Erro ao remover subtópico.');
        }
    };

    // 6. Update sub-macro local
    const handleUpdateSubMacroLocal = (id: string, field: 'name' | 'percentage', value: any) => {
        setEditSubMacros(prev => prev.map(s => {
            if (s.id === id) {
                return { ...s, [field]: value };
            }
            return s;
        }));
    };

    // 7. Save sub-macro update
    const handleSaveSubMacroUpdate = async (sub: ProjectSubMacro) => {
        try {
            const parentMacro = editMacros.find(m => m.id === sub.projectMacroId);
            const parentValue = parentMacro ? (budget?.totalEstimated || 0) * (parentMacro.percentage / 100) : 0;

            const { error } = await supabase
                .from('project_sub_macros')
                .update({
                    name: sub.name,
                    percentage: sub.percentage,
                    estimated_value: parentValue * (sub.percentage / 100)
                })
                .eq('id', sub.id);

            if (error) throw error;
            fetchBudgetData();
            onBudgetUpdate?.();
        } catch (error) {
            console.error('Erro ao atualizar sub-macro:', error);
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

            // 2. Criar macros baseadas no template
            for (const tm of templateMacros) {
                const estimatedVal = (totalEstimated * tm.percentage) / 100;

                const { data: newMacro, error: macroError } = await supabase
                    .from('project_macros')
                    .insert({
                        budget_id: newBudget.id,
                        name: tm.name,
                        percentage: tm.percentage,
                        estimated_value: estimatedVal,
                        spent_value: 0,
                        display_order: tm.displayOrder
                    })
                    .select()
                    .single();

                if (macroError) throw macroError;

                // 3. Criar Sub-macros para esta Macro
                const subsForThisMacro = templateSubMacros.filter(tsm => tsm.macroId === tm.id);
                if (subsForThisMacro.length > 0) {
                    const subMacrosToInsert = subsForThisMacro.map(tsm => ({
                        project_macro_id: newMacro.id,
                        name: tsm.name,
                        percentage: tsm.percentage,
                        estimated_value: (estimatedVal * tsm.percentage) / 100,
                        spent_value: 0,
                        display_order: tsm.displayOrder
                    }));

                    const { error: subError } = await supabase
                        .from('project_sub_macros')
                        .insert(subMacrosToInsert);

                    if (subError) throw subError;
                }
            }

            setShowSetupModal(false);
            fetchBudgetData();
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

                {showSetupModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
                        <div className="glass rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in border border-slate-700">
                            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
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
                    </div>
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
                        <p className="text-white font-black text-lg">{formatCurrency(totalBudget)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Gasto</p>
                        <p className="text-blue-400 font-black text-lg">{formatCurrency(totalSpent)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Saldo</p>
                        <p className={`font-black text-lg ${totalBudget - totalSpent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(totalBudget - totalSpent)}
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
                <div className="flex justify-between items-center px-2">
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                        Por Categoria
                    </h4>
                    {isAdmin && (
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={`text-xs font-bold px-3 py-1 rounded-full border transition ${isEditing
                                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                                }`}
                        >
                            <i className={`fa-solid ${isEditing ? 'fa-check' : 'fa-gear'} mr-2`}></i>
                            {isEditing ? 'Concluir Edição' : 'Personalizar'}
                        </button>
                    )}
                </div>

                {isEditing && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4 animate-fade-in">
                        <div className="flex items-start gap-3">
                            <i className="fa-solid fa-triangle-exclamation text-yellow-400 mt-1"></i>
                            <div>
                                <h5 className="text-sm font-bold text-yellow-400 mb-1">Modo de Personalização</h5>
                                <p className="text-xs text-yellow-400/80 mb-2">
                                    Você está editando a estrutura do orçamento. Alterações nas porcentagens recalcularão automaticamente os valores meta.
                                </p>
                                <div className="text-xs font-mono bg-black/20 rounded px-2 py-1 inline-block">
                                    Soma Total: <span className={editMacros.reduce((acc, m) => acc + m.percentage, 0) === 100 ? 'text-green-400' : 'text-red-400'}>
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
                                        <div className="col-span-7">
                                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Nome da Categoria</label>
                                            <input
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white outline-none focus:border-blue-500"
                                                value={macro.name}
                                                onChange={(e) => handleUpdateMacroLocal(macro.id, 'name', e.target.value)}
                                                onBlur={() => handleSaveMacroUpdate(macro)}
                                            />
                                        </div>
                                        <div className="col-span-4">
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
                                    </div>

                                    <div className="pl-12 pr-1 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Subtópicos</p>
                                            <button
                                                onClick={() => handleAddSubMacro(macro.id)}
                                                className="text-[10px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                            >
                                                <i className="fa-solid fa-plus"></i> Adicionar
                                            </button>
                                        </div>

                                        {editSubMacros.filter(sm => sm.projectMacroId === macro.id).map(sub => (
                                            <div key={sub.id} className="grid grid-cols-12 gap-2 items-center bg-slate-800/30 rounded-lg p-2">
                                                <div className="col-span-1 flex justify-center">
                                                    <i className="fa-solid fa-turn-up rotate-90 text-slate-600 text-[10px]"></i>
                                                </div>
                                                <div className="col-span-7">
                                                    <input
                                                        className="w-full bg-transparent border-b border-transparent focus:border-slate-600 px-1 py-0.5 text-xs font-bold text-slate-300 outline-none"
                                                        value={sub.name}
                                                        onChange={(e) => handleUpdateSubMacroLocal(sub.id, 'name', e.target.value)}
                                                        onBlur={() => handleSaveSubMacroUpdate(sub)}
                                                    />
                                                </div>
                                                <div className="col-span-3 relative">
                                                    <input
                                                        type="number"
                                                        className="w-full bg-transparent border-b border-transparent focus:border-slate-600 px-1 py-0.5 text-xs font-bold text-slate-300 outline-none text-right pr-4"
                                                        value={sub.percentage}
                                                        onChange={(e) => handleUpdateSubMacroLocal(sub.id, 'percentage', parseFloat(e.target.value) || 0)}
                                                        onBlur={() => handleSaveSubMacroUpdate(sub)}
                                                    />
                                                    <span className="absolute right-1 top-0.5 text-slate-500 text-[10px]">%</span>
                                                </div>
                                                <div className="col-span-1 flex justify-center">
                                                    <button
                                                        onClick={() => handleDeleteSubMacro(sub.id)}
                                                        className="text-slate-600 hover:text-red-400"
                                                    >
                                                        <i className="fa-solid fa-xmark"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
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

                                {expandedMacroId === macro.id && (
                                    <div className="mt-4 pl-4 border-l-2 border-slate-700 space-y-3 animate-fade-in">
                                        {projectSubMacros.filter(sm => sm.projectMacroId === macro.id).length > 0 ? (
                                            projectSubMacros.filter(sm => sm.projectMacroId === macro.id).map(sub => {
                                                const subProgress = sub.estimatedValue > 0 ? (sub.spentValue / sub.estimatedValue) * 100 : 0;
                                                return (
                                                    <div key={sub.id} className="text-xs">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-slate-300 font-bold">{sub.name}</span>
                                                            <span className={`${subProgress > 100 ? 'text-red-400' : 'text-slate-400'}`}>
                                                                {formatCurrency(sub.spentValue)} / {formatCurrency(sub.estimatedValue)}
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${subProgress > 100 ? 'bg-red-500' : 'bg-blue-400'}`}
                                                                style={{ width: `${Math.min(subProgress, 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <p className="text-xs text-slate-600 italic">Nenhum subtópico configurado.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default BudgetSection;
