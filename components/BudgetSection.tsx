
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Project, ProjectBudget, ProjectMacro, TemplateMacro, CostTemplate, ProjectItem, getProjectStages, getStageIndex } from '../types';
import { supabase } from '../supabaseClient';
import { formatCurrencyAbbrev } from '../utils'; // Import added
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import { usePlan } from './PlanProvider';
import { computeScheduleDates } from '../utils/schedule';
import { useProjects } from '../hooks/useProjects';

/**
 * RÉGUA FIXA — por que não se adiciona, remove nem renomeia etapa aqui.
 *
 * "Etapa é a régua, Item é o espelho": as etapas são as mesmas em toda obra, e é
 * isso que deixa comparar uma obra com a outra e aprender o custo real para a
 * próxima — o motivo de o produto existir. Etapa livre por obra destruiria a
 * comparação em silêncio. Além disso, `getProjectStages` monta as fronteiras do
 * AVANÇO a partir do % das etapas (acc/denom): tirar uma etapa muda o denominador
 * e move a régua de todas as obras.
 *
 * O que varia por obra: o % de cada etapa (o preset é sugestão) e os itens dentro
 * dela. Mudar o % move as fronteiras — por isso handleSaveMacroUpdate re-ancora o
 * progresso, senão a obra escorrega de etapa sozinha.
 */
interface BudgetSectionProps {
    project: Project;
    isAdmin: boolean;
    onBudgetUpdate?: () => void;
    // Para re-ancorar project.progress quando o % das etapas muda.
    onUpdate?: (id: string, updates: Partial<Project>, logMsg?: string) => void;
}

const DEFAULT_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

/**
 * Aprende o RITMO (duração de cada etapa) de uma obra concluída pelas datas das
 * fotos (stage_evidences). Interpola linearmente a data em cada fronteira de etapa
 * e usa a duração como PESO do cronograma — substituindo o % de custo (que hoje é
 * usado como se fosse tempo). Assim o acabamento (barato mas lento) ganha o prazo
 * real dele. Devolve { displayOrder: pesoDeDuração } das etapas de fase
 * (não-timeBased), ou null se não há datas espalhadas o bastante.
 */
function learnStageDurations(source: Project): Record<number, number> | null {
    const fases = (source.budget?.macros || [])
        .filter(m => !m.timeBased)
        .sort((a, b) => a.displayOrder - b.displayOrder);
    if (fases.length === 0) return null;

    // Fronteiras de progresso (0..100) de cada etapa de fase (renormalizadas).
    const totalPct = fases.reduce((s, m) => s + (m.percentage || 0), 0);
    const bounds: number[] = [0];
    let acc = 0;
    fases.forEach(m => {
        acc += totalPct > 0 ? (m.percentage || 0) : (100 / fases.length);
        bounds.push(totalPct > 0 ? (acc / totalPct) * 100 : acc);
    });
    bounds[bounds.length - 1] = 100;

    // Âncoras (progresso, tempo em ms): início(0), cada foto datada, entrega(100).
    const parseD = (s?: string): number | null =>
        s && s.length >= 10 && s !== '1970-01-01' ? new Date(s + 'T00:00:00').getTime() : null;
    const anchors: { p: number; t: number }[] = [];
    const t0 = parseD(source.startDate);
    if (t0 != null) anchors.push({ p: 0, t: t0 });
    (source.stageEvidence || []).forEach(e => {
        const t = parseD(e.date);
        if (t != null && typeof e.stage === 'number') anchors.push({ p: e.stage, t });
    });
    const tEnd = parseD(source.deliveryDate);
    if (tEnd != null) anchors.push({ p: 100, t: tEnd });

    anchors.sort((a, b) => a.p - b.p || a.t - b.t);
    const uniq: { p: number; t: number }[] = [];
    anchors.forEach(a => { if (!uniq.length || uniq[uniq.length - 1].p !== a.p) uniq.push(a); });
    if (uniq.length < 2 || uniq[uniq.length - 1].t - uniq[0].t <= 0) return null;

    const dateAt = (p: number): number => {
        if (p <= uniq[0].p) return uniq[0].t;
        if (p >= uniq[uniq.length - 1].p) return uniq[uniq.length - 1].t;
        for (let i = 0; i < uniq.length - 1; i++) {
            const a = uniq[i], b = uniq[i + 1];
            if (p >= a.p && p <= b.p) {
                return b.p === a.p ? a.t : a.t + ((p - a.p) / (b.p - a.p)) * (b.t - a.t);
            }
        }
        return uniq[uniq.length - 1].t;
    };

    const weights: Record<number, number> = {};
    let total = 0;
    fases.forEach((m, i) => {
        const dur = Math.max(0, dateAt(bounds[i + 1]) - dateAt(bounds[i]));
        weights[m.displayOrder] = dur;
        total += dur;
    });
    if (total <= 0) return null;
    // Etapa sem separação temporal ganha um mínimo pra não sumir do cronograma.
    const minW = total * 0.005;
    fases.forEach(m => { if (weights[m.displayOrder] <= 0) weights[m.displayOrder] = minW; });
    return weights;
}

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

const BudgetSection: React.FC<BudgetSectionProps> = ({ project, isAdmin, onBudgetUpdate, onUpdate }) => {
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

    // ── APRENDER DE OBRA CONCLUÍDA: previsto por item ────────────────────────────
    // Molde de itens: puxa a distribuição REAL por (etapa, item) de uma obra já
    // concluída e reescreve o Previsto por item desta obra. Casa etapa e item por
    // display_order (as duas obras nascem do mesmo template → mesma ordem).
    const { data: allProjects } = useProjects();
    const [moldeItensSource, setMoldeItensSource] = useState<string | null>(null);
    const [aplicandoMolde, setAplicandoMolde] = useState(false);

    // Obras que podem servir de molde de itens: concluídas (100%) E com despesa
    // classificada por etapa+item (senão o molde viria vazio).
    const obrasMoldeItens = (allProjects || []).filter(p =>
        p.id !== project.id &&
        p.progress >= 100 &&
        (p.expenses || []).some(e => e.itemId && e.macroId)
    );

    const aplicarMoldeItens = async (sourceId: string) => {
        const source = (allProjects || []).find(p => p.id === sourceId);
        if (!source) return;
        const sourceName = source.name;
        if (!window.confirm(
            `Isso substitui o Previsto por item desta obra pela distribuição REAL da obra "${sourceName}" (o que ela gastou de verdade em cada item, por etapa). Os valores continuam editáveis. Continuar?`
        )) return;

        setAplicandoMolde(true);
        try {
            // 1. Ordem dos itens da obra-fonte (não vem no objeto do projeto).
            const { data: srcItems } = await supabase
                .from('project_items').select('id, display_order').eq('project_id', sourceId);
            const srcItemOrder: Record<string, number> = {};
            (srcItems || []).forEach((it: any) => { srcItemOrder[it.id] = it.display_order; });
            const srcMacroOrder: Record<string, number> = {};
            (source.budget?.macros || []).forEach(m => { srcMacroOrder[m.id] = m.displayOrder; });

            // 2. Gasto por (ordem da etapa, ordem do item) — só despesas itemizadas.
            const perStageItem: Record<string, number> = {};
            const perStageTotal: Record<number, number> = {};
            (source.expenses || []).forEach(e => {
                if (!e.macroId || !e.itemId) return;
                const mOrd = srcMacroOrder[e.macroId];
                const iOrd = srcItemOrder[e.itemId];
                if (mOrd == null || iOrd == null) return;
                perStageItem[`${mOrd}|${iOrd}`] = (perStageItem[`${mOrd}|${iOrd}`] || 0) + (e.value || 0);
                perStageTotal[mOrd] = (perStageTotal[mOrd] || 0) + (e.value || 0);
            });

            // 3. Mapear pra ESTA obra (ordem → id) e montar % dentro da etapa.
            const tgtMacroByOrder: Record<number, string> = {};
            macros.forEach(m => { tgtMacroByOrder[m.displayOrder] = m.id; });
            const tgtItemByOrder: Record<number, string> = {};
            projectItems.forEach(it => { tgtItemByOrder[it.displayOrder] = it.id; });

            const byStage: Record<number, { macroId: string; itemId: string; pct: number }[]> = {};
            Object.entries(perStageItem).forEach(([key, spend]) => {
                const [mOrd, iOrd] = key.split('|').map(Number);
                const total = perStageTotal[mOrd];
                const macroId = tgtMacroByOrder[mOrd];
                const itemId = tgtItemByOrder[iOrd];
                if (!total || !macroId || !itemId) return;
                (byStage[mOrd] ||= []).push({ macroId, itemId, pct: (spend / total) * 100 });
            });

            // 4. Arredonda por etapa e joga a sobra na maior pra fechar 100%.
            const rows: { project_id: string; macro_id: string; item_id: string; percentage: number; display_order: number }[] = [];
            Object.values(byStage).forEach(list => {
                const rounded = list.map(r => ({ ...r, pct: Math.round(r.pct * 10) / 10 }));
                const sum = rounded.reduce((s, r) => s + r.pct, 0);
                const diff = Math.round((100 - sum) * 10) / 10;
                if (diff !== 0 && rounded.length) {
                    let mi = 0;
                    rounded.forEach((r, i) => { if (r.pct > rounded[mi].pct) mi = i; });
                    rounded[mi].pct = Math.round((rounded[mi].pct + diff) * 10) / 10;
                }
                rounded.sort((a, b) => b.pct - a.pct);
                rounded.forEach((r, i) => rows.push({
                    project_id: project.id, macro_id: r.macroId, item_id: r.itemId,
                    percentage: r.pct, display_order: i,
                }));
            });

            if (rows.length === 0) {
                alert('A obra escolhida não tem gasto por item suficiente para virar molde.');
                return;
            }

            // 5. Substitui: apaga o previsto atual e grava o aprendido.
            const { error: delErr } = await supabase
                .from('project_stage_items').delete().eq('project_id', project.id);
            if (delErr) throw delErr;
            const { error: insErr } = await supabase.from('project_stage_items').insert(rows);
            if (insErr) throw insErr;
            await reloadStageItems();
            setMoldeItensSource(sourceName);
        } catch (e: any) {
            console.error('Erro ao aplicar molde de itens:', e);
            alert('Erro ao puxar o previsto por item da obra escolhida.');
        } finally {
            setAplicandoMolde(false);
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
            // Em qual etapa a obra está, medido pela régua ANTES da mudança.
            const idxAntes = getStageIndex(getProjectStages(project), project.progress);

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

            // RE-ANCORAGEM. project.progress é "% do CUSTO já vencido", e as fronteiras
            // saem do % das etapas — mexer no % move as fronteiras debaixo de um número
            // que ficou parado, e a obra troca de etapa sozinha (medido: com Estrutura
            // 22%->35%, um progresso de 75 pulava de "Revestimentos" para "Instalações",
            // andando para TRÁS sem ninguém pedir).
            // Aqui o certo é o contrário: a etapa é o que o usuário afirmou, o número é
            // derivado. Mantemos a etapa e recalculamos o número. Dizer "Estrutura custa
            // 35%, não 22%" faz o início de Revestimentos valer 77% do custo em vez de
            // 63% — então o progresso SOBE, e a obra continua onde está.
            const macrosDepois = editMacros.map(m => (m.id === macro.id ? macro : m));
            const stagesDepois = getProjectStages({ budget: { macros: macrosDepois } });
            const novoProgress = stagesDepois[idxAntes]?.value;
            // Obra concluída (>=100) não se re-ancora: getStageIndex devolve stages.length
            // (fora da régua) e 100 não é fronteira de etapa, é o fim.
            if (
                onUpdate &&
                project.progress < 100 &&
                novoProgress !== undefined &&
                novoProgress !== project.progress
            ) {
                onUpdate(
                    project.id,
                    { progress: novoProgress },
                    `Régua do orçamento mudou: avanço reancorado ${project.progress}% -> ${novoProgress}% (obra segue em "${stagesDepois[idxAntes].name}")`
                );
            }

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
            alert('Defina a data de início e a de entrega da obra para gerar o cronograma automaticamente.\n\nElas ficam no lápis (Editar) do card da obra, na tela Início.');
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

    // Obras que podem ensinar o RITMO: concluídas (100%) com fotos em ≥2 datas
    // diferentes (senão não dá pra medir duração de etapa).
    const obrasMoldeRitmo = (allProjects || []).filter(p => {
        if (p.id === project.id || p.progress < 100) return false;
        const datas = new Set((p.stageEvidence || [])
            .map(e => e.date).filter(d => d && d.length >= 10 && d !== '1970-01-01'));
        return datas.size >= 2;
    });

    // Gera o cronograma repartindo o prazo pelo TEMPO real aprendido (não pelo custo).
    const handleGenerateScheduleFromObra = async (sourceId: string) => {
        if (!project.startDate || !project.deliveryDate) {
            alert('Defina a data de início e a de entrega desta obra para gerar o cronograma.\n\nElas ficam no lápis (Editar) do card da obra, na tela Início.');
            return;
        }
        const source = (allProjects || []).find(p => p.id === sourceId);
        if (!source) return;
        const weights = learnStageDurations(source);
        if (!weights) {
            alert('A obra escolhida não tem fotos datadas suficientes para aprender o ritmo (precisa de datas espalhadas ao longo da obra).');
            return;
        }
        // Substitui o peso das FASES pela duração real; o Canteiro (timeBased) segue
        // atravessando a obra toda (o cronograma ignora o peso dele de qualquer forma).
        const macrosRitmo = macros.map(m =>
            m.timeBased ? m : { ...m, percentage: weights[m.displayOrder] ?? (m.percentage || 0) });
        const updates = computeScheduleDates(macrosRitmo, project.startDate, project.deliveryDate);
        if (updates.length === 0) {
            alert('A data de entrega precisa ser posterior à data de início.');
            return;
        }
        const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
        if (!window.confirm(
            `Gerar o cronograma usando o RITMO real da obra "${source.name}" — o tempo que cada etapa levou lá (pelas datas das fotos), não o % de custo — entre ${fmt(project.startDate)} e ${fmt(project.deliveryDate)}?\n\nIsto substitui as datas planejadas atuais.`
        )) return;
        try {
            await Promise.all(updates.map(u =>
                supabase.from('project_macros')
                    .update({ planned_start_date: u.planned_start_date, planned_end_date: u.planned_end_date })
                    .eq('id', u.id)
            ));
            fetchBudgetData(true);
            onBudgetUpdate?.();
            alert(`Cronograma gerado pelo ritmo da obra "${source.name}"! Veja no botão "Cronograma" da obra; ajuste as datas se precisar.`);
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

    // handleAddMacro / handleDeleteMacro REMOVIDOS: a régua é fixa (ver a nota no topo).
    // Ficariam como código morto convidando a religar o botão — e apagar uma etapa
    // mudava o denominador da régua, movendo o avanço de todas as obras.

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

            // NÃO semear as etapas aqui: o gatilho handle_new_project_budget roda dentro
            // do INSERT acima e já as cria. Semear de novo dobrava tudo — 9 etapas viravam
            // 18 e o Previsto saía em dobro. Era o mesmo defeito do e448f22, que consertou
            // só o caminho de auto-criação (fetchBudgetData) e deixou este de fora; ele
            // pega quem abre a obra SEM casas e vem configurar o orçamento por aqui.
            // De quebra, o laço não copiava time_based e devolvia o Canteiro à régua do
            // avanço. O Previsto por item é semeado por seed_project_stage_items abaixo.
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

                {viewMode === 'stage' && isAdmin && obrasMoldeRitmo.length > 0 && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mx-2 space-y-1 animate-fade-in">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-graduation-cap text-blue-400 text-xs"></i>
                            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider">Cronograma pelo ritmo de uma obra concluída</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            Em vez de repartir o prazo pelo <b className="text-slate-400">% de custo</b>, usa o <b className="text-slate-400">tempo real</b> que cada etapa levou numa obra sua já terminada (pelas datas das fotos). O acabamento ganha o prazo real dele.
                        </p>
                        <select
                            value=""
                            onChange={(e) => { if (e.target.value) handleGenerateScheduleFromObra(e.target.value); }}
                            className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-blue-400 text-[11px] cursor-pointer"
                        >
                            <option value="">↧ gerar cronograma pelo ritmo de uma obra concluída…</option>
                            {obrasMoldeRitmo.map(o => (
                                <option key={o.id} value={o.id}>{o.name} — ritmo real</option>
                            ))}
                        </select>
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

                {isEditing && ent.canUseItens && obrasMoldeItens.length > 0 && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-4 space-y-1 animate-fade-in">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-graduation-cap text-blue-400 text-xs"></i>
                            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider">Aprender de uma obra concluída</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                            Puxa o <b className="text-slate-400">previsto por item</b> de uma obra que você já terminou (o que ela gastou de verdade em cada item, por etapa). Continua editável.
                        </p>
                        <select
                            value=""
                            disabled={aplicandoMolde}
                            onChange={(e) => { if (e.target.value) aplicarMoldeItens(e.target.value); }}
                            className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl outline-none font-bold text-blue-400 text-[11px] cursor-pointer disabled:opacity-50"
                        >
                            <option value="">{aplicandoMolde ? 'Aplicando…' : '↧ puxar o previsto por item de uma obra concluída…'}</option>
                            {obrasMoldeItens.map(o => (
                                <option key={o.id} value={o.id}>{o.name} — como ela gastou de verdade</option>
                            ))}
                        </select>
                        {moldeItensSource && (
                            <p className="text-[10px] text-blue-400/80 font-bold">
                                <i className="fa-solid fa-check"></i> previsto por item veio da obra “{moldeItensSource}” — ajuste à vontade
                            </p>
                        )}
                    </div>
                )}

                {isEditing ? (
                    <div className="space-y-4">
                        {editMacros.map(macro => (
                            <div key={macro.id} className="glass rounded-2xl p-4 border border-blue-500/30 animate-fade-in">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-12 gap-3 items-center">
                                        <div className="col-span-1 flex justify-center">
                                            <i className="fa-solid fa-lock text-xs text-slate-600" title="Etapa fixa — igual em toda obra"></i>
                                        </div>
                                        {/* Nome só de leitura: renomear etapa quebra a comparação entre obras
                                            (e o casamento por nome com o template dos itens). */}
                                        <div className="col-span-11 md:col-span-5">
                                            <label className="text-[9px] font-black text-slate-500 uppercase ml-1">Etapa</label>
                                            <div className="w-full bg-slate-800/50 border border-slate-800 rounded-lg px-3 py-2 text-sm font-bold text-slate-300 flex items-center gap-2">
                                                <span className="truncate">{macro.name}</span>
                                                {macro.timeBased && (
                                                    <span className="text-[9px] font-black text-amber-400/80 whitespace-nowrap">· corre a obra toda</span>
                                                )}
                                            </div>
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

                        {/* As 9 etapas são a régua fixa da obra — não se adiciona nem se
                            remove etapa. O que varia de obra para obra é o % e os itens
                            dentro dela. Ver a nota "RÉGUA FIXA" no topo do arquivo. */}
                        <div className="flex items-start gap-2 text-[11px] text-slate-500 px-2 py-3 border-t border-slate-800">
                            <i className="fa-solid fa-lock mt-0.5 text-slate-600"></i>
                            <span>
                                As etapas são fixas e iguais em toda obra — é o que deixa comparar uma obra com a outra
                                e aprender o custo real para a próxima. Ajuste o <b className="text-slate-400">%</b> e os
                                <b className="text-slate-400"> itens</b> de cada uma.
                            </span>
                        </div>
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
