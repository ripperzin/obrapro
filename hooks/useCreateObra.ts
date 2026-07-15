import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { generateId } from '../utils';
import { computeScheduleDates } from '../utils/schedule';

const DEFAULT_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

export interface UnitType {
    quantidade: number;
    area: number;
}

export interface CreateObraInput {
    name: string;
    startDate?: string;
    deliveryDate?: string;
    unitTypes: UnitType[]; // pode vir vazio (unidades opcionais)
    custoM2: number;
    userId: string;
    userName: string;
    // Modo "obra já em andamento" (snapshot de abertura): números agregados
    // que viram um aporte + um gasto de abertura, mantendo a fonte única de caixa.
    openingBudget?: number;    // orçamento total informado (quando não há construção detalhada)
    openingProgress?: number;  // progresso físico atual (0-100)
    openingAportado?: number;  // total já aportado até hoje
    openingGasto?: number;     // total já gasto até hoje
    terrenoValue?: number;     // valor do terreno (custo de aquisição)
    terrenoPaidFromProject?: boolean; // terreno saiu do caixa da obra?
    // Régua do orçamento ajustada pelo usuário na criação. Se vier, sobrescreve
    // o % que o preset semeou (casada por display_order). Ausente = usa o preset.
    stagePercentages?: { displayOrder: number; percentage: number }[];
}

/**
 * Cria uma obra COMPLETA numa sequência: projeto -> unidades -> orçamento.
 * As unidades recebem custo = área × R$/m². Ao inserir as unidades, os triggers
 * do banco recalculam o custo total; ao inserir o orçamento, o template das 8
 * etapas é copiado automaticamente. Tudo editável depois.
 */
export const useCreateObra = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: CreateObraInput) => {
            const projectId = generateId();

            const totalUnits = input.unitTypes.reduce((s, t) => s + (t.quantidade || 0), 0);
            const totalArea = input.unitTypes.reduce((s, t) => s + (t.quantidade || 0) * (t.area || 0), 0);
            const construcaoCost = Math.round(totalArea * (input.custoM2 || 0) * 100) / 100;
            // Sem construção detalhada, o orçamento vem do valor informado (modo "em andamento").
            const totalCost = construcaoCost > 0 ? construcaoCost : Math.round((input.openingBudget || 0) * 100) / 100;
            const openingProgress = Math.max(0, Math.min(100, Math.round(input.openingProgress || 0)));

            // 1) Projeto
            const { error: pErr } = await supabase.from('projects').insert([{
                id: projectId,
                name: input.name,
                start_date: input.startDate || null,
                delivery_date: input.deliveryDate || null,
                unit_count: totalUnits,
                total_area: totalArea,
                expected_total_cost: totalCost,
                custo_m2: input.custoM2 || 0,
                progress: openingProgress,
            }]);
            if (pErr) throw pErr;

            // Log de criação (mesmo padrão do createProjectMutationFn)
            await supabase.from('logs').insert([{
                project_id: projectId,
                user_id: input.userId,
                user_name: input.userName,
                action: 'Criação',
                field: 'Projeto',
                old_value: '-',
                new_value: input.name,
            }]);

            // 2) Unidades (custo = área × R$/m²) — os triggers recalculam os totais do projeto
            if (totalUnits > 0 && input.custoM2 > 0) {
                const units: any[] = [];
                let n = 1;
                for (const t of input.unitTypes) {
                    for (let i = 0; i < (t.quantidade || 0); i++) {
                        units.push({
                            project_id: projectId,
                            identifier: `Unidade ${n}`,
                            area: t.area,
                            cost: Math.round((t.area || 0) * input.custoM2 * 100) / 100,
                            status: 'Available',
                        });
                        n++;
                    }
                }
                const { error: uErr } = await supabase.from('units').insert(units);
                if (uErr) throw uErr;
            }

            // 3) Orçamento — dispara handle_new_project_budget que copia as 8 etapas do template
            if (totalCost > 0) {
                const { error: bErr } = await supabase.from('project_budgets').insert([{
                    project_id: projectId,
                    total_estimated: totalCost,
                    template_id: DEFAULT_TEMPLATE_ID,
                }]);
                if (bErr) throw bErr;

                // 3.1) Régua ajustada na criação: o gatilho já semeou o preset, então
                // aqui só sobrescrevemos o % (e o valor previsto) das etapas que o
                // usuário mexeu. Vem ANTES do cronograma, que lê esses %.
                if (input.stagePercentages && input.stagePercentages.length > 0) {
                    const { data: bud } = await supabase.from('project_budgets').select('id').eq('project_id', projectId).single();
                    if (bud) {
                        const { data: seeded } = await supabase
                            .from('project_macros')
                            .select('id, display_order')
                            .eq('budget_id', bud.id);
                        for (const s of input.stagePercentages) {
                            const macro = (seeded || []).find(m => m.display_order === s.displayOrder);
                            if (!macro) continue;
                            await supabase.from('project_macros').update({
                                percentage: s.percentage,
                                estimated_value: Math.round(totalCost * s.percentage) / 100,
                            }).eq('id', macro.id);
                        }
                    }
                }

                // 4) Cronograma automático: distribui as datas das etapas entre início e
                // entrega, proporcional ao peso (%) de cada uma (o canteiro atravessa a
                // obra inteira). Mesmo cálculo do botão "Gerar cronograma" — utils/schedule.
                // Editável depois no Orçamento.
                if (input.startDate && input.deliveryDate) {
                    const { data: bud } = await supabase.from('project_budgets').select('id').eq('project_id', projectId).single();
                    if (bud) {
                        const { data: macros } = await supabase
                            .from('project_macros')
                            .select('id, percentage, display_order, time_based')
                            .eq('budget_id', bud.id)
                            .order('display_order');
                        const updates = computeScheduleDates(
                            (macros || []).map(m => ({
                                id: m.id,
                                percentage: m.percentage,
                                displayOrder: m.display_order,
                                timeBased: m.time_based || false,
                            })),
                            input.startDate,
                            input.deliveryDate
                        );
                        for (const u of updates) {
                            await supabase.from('project_macros')
                                .update({ planned_start_date: u.planned_start_date, planned_end_date: u.planned_end_date })
                                .eq('id', u.id);
                        }
                    }
                }
            }

            // 5) Snapshot de abertura ("obra já em andamento"): transforma os totais
            // informados em UM aporte e UM gasto de abertura, para o caixa fechar pela
            // fonte única (aportado - gasto = saldo). Detalhe por etapa vem depois.
            const openingDate = input.startDate || new Date().toISOString().slice(0, 10);

            // Terreno (custo de aquisição) — entra no custo do empreendimento e no lucro.
            if ((input.terrenoValue || 0) > 0) {
                const { error: tErr } = await supabase.from('acquisition_costs').insert([{
                    project_id: projectId,
                    category: 'terreno',
                    value: Math.round((input.terrenoValue || 0) * 100) / 100,
                    date: openingDate,
                    paid_from_project: !!input.terrenoPaidFromProject,
                    user_id: input.userId,
                    user_name: input.userName,
                }]);
                if (tErr) throw tErr;
            }

            if ((input.openingGasto || 0) > 0) {
                const { error: gErr } = await supabase.from('expenses').insert([{
                    id: generateId(),
                    project_id: projectId,
                    description: 'Gasto acumulado (abertura)',
                    value: Math.round((input.openingGasto || 0) * 100) / 100,
                    date: openingDate,
                    user_id: input.userId,
                    user_name: input.userName,
                    macro_id: null,
                }]);
                if (gErr) throw gErr;
            }

            if ((input.openingAportado || 0) > 0) {
                // Aporte precisa de um sócio: cria "Recursos próprios" como pagador de abertura.
                const { data: inv, error: iErr } = await supabase.from('investors').insert([{
                    project_id: projectId,
                    name: 'Recursos próprios',
                }]).select('id').single();
                if (iErr) throw iErr;
                const { error: cErr } = await supabase.from('contributions').insert([{
                    project_id: projectId,
                    investor_id: inv.id,
                    value: Math.round((input.openingAportado || 0) * 100) / 100,
                    date: openingDate,
                    description: 'Aporte inicial (abertura)',
                    user_id: input.userId,
                    user_name: input.userName,
                }]);
                if (cErr) throw cErr;
            }

            return { id: projectId };
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
    });
};
