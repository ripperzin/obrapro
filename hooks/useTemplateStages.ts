import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

const DEFAULT_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

export interface TemplateStage {
    name: string;
    percentage: number;
    displayOrder: number;
    timeBased: boolean;
}

/**
 * O preset de etapas (a "sugestão MCMV") lido do BANCO, que é quem de fato
 * semeia o orçamento da obra nova.
 *
 * ⚠️ Por que do banco e não de uma lista no código: existia
 * `BUDGET_STAGES`/`CONSTRUCTION_STAGES` em constants/types com 8 etapas e %
 * antigas, e a tela de Nova Obra mostrava ELAS — enquanto o gatilho do banco
 * criava 9 etapas com % diferentes (o Canteiro entrou com 5% e as outras foram
 * ajustadas). A prévia mentia. Lendo do banco, prévia e obra são a mesma coisa
 * por construção. CONSTRUCTION_STAGES segue só como fallback de obra sem
 * orçamento (e fonte de ícone/apelido) — ver getProjectStages.
 */
export const useTemplateStages = () =>
    useQuery({
        queryKey: ['template-stages', DEFAULT_TEMPLATE_ID],
        queryFn: async (): Promise<TemplateStage[]> => {
            const { data, error } = await supabase
                .from('template_macros')
                .select('name, percentage, display_order, time_based')
                .eq('template_id', DEFAULT_TEMPLATE_ID)
                .order('display_order');
            if (error) throw error;
            return (data || []).map((m) => ({
                name: m.name,
                percentage: Number(m.percentage) || 0,
                displayOrder: m.display_order,
                timeBased: m.time_based || false,
            }));
        },
        staleTime: 60 * 60 * 1000, // o preset quase não muda
    });
