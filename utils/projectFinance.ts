import { Project, Unit } from '../types';

/**
 * Fonte ÚNICA dos números financeiros do empreendimento.
 * Substitui os cálculos espalhados/duplicados e — importante — DESCONTA o
 * terreno/aquisição do lucro (que antes era ignorado, inflando o resultado).
 */
export interface ProjectFinance {
    // Caixa / transparência
    aportado: number;           // aportes em DINHEIRO (entraram no caixa)
    aporteViaDespesa: number;   // despesas pagas direto por sócios (não passaram pelo caixa)
    aportadoTotal: number;      // aportado + aporteViaDespesa (total colocado pelos sócios)
    gasto: number;              // despesas de obra (total, quem quer que tenha pago)
    gastoDoCaixa: number;       // despesas pagas pelo caixa (gasto - aporteViaDespesa)
    aquisicaoTotal: number;     // terreno + custos iniciais (todos)
    aquisicaoPaga: number;      // aquisição paga pela obra (saiu do caixa)
    saidaTotal: number;         // gastoDoCaixa + aquisiçãoPaga (tudo que saiu do caixa)
    saldoCaixa: number;         // aportado (dinheiro) - saidaTotal

    // Gasto x Progresso (prestação de contas)
    orcamentoObra: number;      // custo previsto da obra (sem terreno)
    gastoPct: number;           // gasto / orçamento da obra (%)
    progresso: number;          // progresso físico (%)

    // Empreendimento / rentabilidade — PROJETADO (só as casas COM preço definido)
    custoTotalEmpreendimento: number; // orçamento obra + aquisição total (todas as casas)
    vendasRealizadas: number;         // unidades vendidas (saleValue)
    vendasPotencial: number;          // disponíveis (valorEstimadoVenda)
    vendasEstimadasTotais: number;    // soma do preço das casas COM preço (vendida=real, senão estimado)
    custoObraProjetado: number;       // custo de obra orçado só das casas com preço
    terrenoProjetado: number;         // fatia do terreno (por área) só das casas com preço
    lucroProjetado: number;           // vendas − obra − terreno (só das casas com preço)
    unidadesComPreco: number;         // nº de casas com preço (as que entram na projeção)
    margemPct: number;                // lucro / vendas estimadas (%)

    // REALIZADO (só o que aconteceu — casas efetivamente vendidas)
    unidadesTotais: number;           // nº de unidades
    unidadesVendidas: number;         // nº de unidades vendidas
    areaTotal: number;                // soma da área das unidades
    areaVendida: number;              // soma da área das unidades vendidas
    custoRealVendidas: number;        // custo (obra+terreno) das casas vendidas
    custoRealEstimado: boolean;       // true enquanto a obra não concluiu (custo usa piso do orçado)
    lucroReal: number;                // vendas realizadas - custo das vendidas
    margemRealPct: number;            // lucro real / vendas realizadas (%)
}

export function computeProjectFinance(project: Project): ProjectFinance {
    const contributions = project.contributions || [];
    const expenses = project.expenses || [];
    const acq = project.acquisitionCosts || [];
    const units = project.units || [];

    const aportado = contributions.reduce((s, c) => s + (c.value || 0), 0); // aportes em dinheiro
    const gasto = expenses.reduce((s, e) => s + (e.value || 0), 0);         // custo total (qualquer pagador)
    // Despesa paga direto por um sócio: não saiu do caixa; conta como aporte dele
    const aporteViaDespesa = expenses.filter((e) => e.paidByInvestorId).reduce((s, e) => s + (e.value || 0), 0);
    const gastoDoCaixa = gasto - aporteViaDespesa;
    const aportadoTotal = aportado + aporteViaDespesa;
    const aquisicaoTotal = acq.reduce((s, a) => s + (a.value || 0), 0);
    const aquisicaoPaga = acq.filter((a) => a.paidFromProject).reduce((s, a) => s + (a.value || 0), 0);
    const saidaTotal = gastoDoCaixa + aquisicaoPaga;   // só o que saiu do caixa
    const saldoCaixa = aportado - saidaTotal;          // dinheiro que entrou - dinheiro que saiu

    const orcamentoObra = project.expectedTotalCost || units.reduce((s, u) => s + (u.cost || 0), 0);
    const gastoPct = orcamentoObra > 0 ? (gasto / orcamentoObra) * 100 : 0;
    const progresso = project.progress || 0;

    const custoTotalEmpreendimento = orcamentoObra + aquisicaoTotal;
    const areaTotal = units.reduce((s, u) => s + (u.area || 0), 0);

    const vendasRealizadas = units
        .filter((u) => u.status === 'Sold')
        .reduce((s, u) => s + (u.saleValue || 0), 0);
    const vendasPotencial = units
        .filter((u) => u.status !== 'Sold')
        .reduce((s, u) => s + (u.valorEstimadoVenda || 0), 0);

    // PROJETADO — só entram as casas QUE TÊM PREÇO (vendida = valor real; senão o
    // estimado). Casa SEM preço fica de fora: não soma venda NEM joga o custo dela
    // contra a projeção — senão dava "prejuízo fantasma" só por ainda não ter preço.
    // Cada casa carrega sua fatia do terreno por área. Com TODAS precificadas, o
    // custo somado volta a ser orçamento + terreno (a projeção do empreendimento cheio).
    const precoProjetado = (u: Unit) => (u.status === 'Sold' ? (u.saleValue || 0) : (u.valorEstimadoVenda || 0));
    const unidadesComPreco = units.filter((u) => precoProjetado(u) > 0);
    const terrenoDaUnidade = (u: Unit) => (areaTotal > 0 ? (u.area || 0) / areaTotal : 0) * aquisicaoTotal;

    const vendasEstimadasTotais = unidadesComPreco.reduce((s, u) => s + precoProjetado(u), 0);
    const custoObraProjetado = unidadesComPreco.reduce((s, u) => s + (u.cost || 0), 0);
    const terrenoProjetado = unidadesComPreco.reduce((s, u) => s + terrenoDaUnidade(u), 0);
    const lucroProjetado = vendasEstimadasTotais - custoObraProjetado - terrenoProjetado;
    const margemPct = vendasEstimadasTotais > 0 ? (lucroProjetado / vendasEstimadasTotais) * 100 : 0;

    // REALIZADO: custo das casas efetivamente vendidas (obra + terreno)
    const soldUnits = units.filter((u) => u.status === 'Sold');
    const areaVendida = soldUnits.reduce((s, u) => s + (u.area || 0), 0);
    const areaShareVendida = areaTotal > 0 ? areaVendida / areaTotal : 0;
    const isConcluida = progresso >= 100;
    // Custo rateado das despesas já lançadas (subdimensionado enquanto a obra corre)
    const custoRateadoVendidas = areaShareVendida * (gasto + aquisicaoTotal);
    // Custo orçado das casas vendidas (estimativa confiável) + fatia do terreno
    const custoOrcadoVendidas = soldUnits.reduce((s, u) => s + (u.cost || 0), 0) + areaShareVendida * aquisicaoTotal;
    // Enquanto NÃO concluída, usa o maior entre gasto-rateado e orçado → nunca infla o lucro
    // (evita a "margem falsa" ao vender uma casa antes de haver despesas). Concluída = custo real final.
    const custoRealEstimado = !isConcluida;
    const custoRealVendidas = isConcluida ? custoRateadoVendidas : Math.max(custoRateadoVendidas, custoOrcadoVendidas);
    const lucroReal = vendasRealizadas - custoRealVendidas;
    const margemRealPct = vendasRealizadas > 0 ? (lucroReal / vendasRealizadas) * 100 : 0;

    return {
        aportado,
        aporteViaDespesa,
        aportadoTotal,
        gasto,
        gastoDoCaixa,
        aquisicaoTotal,
        aquisicaoPaga,
        saidaTotal,
        saldoCaixa,
        orcamentoObra,
        gastoPct,
        progresso,
        custoTotalEmpreendimento,
        vendasRealizadas,
        vendasPotencial,
        vendasEstimadasTotais,
        custoObraProjetado,
        terrenoProjetado,
        lucroProjetado,
        unidadesComPreco: unidadesComPreco.length,
        margemPct,
        unidadesTotais: units.length,
        unidadesVendidas: soldUnits.length,
        areaTotal,
        areaVendida,
        custoRealVendidas,
        custoRealEstimado,
        lucroReal,
        margemRealPct,
    };
}

/**
 * Quanto a obra REALMENTE custou por m² = gasto ÷ área das casas.
 *
 * É este o número que serve de referência para a próxima obra. O `custoM2`
 * guardado na obra é o que foi ESTIMADO na criação (um chute de partida); este
 * é o que aconteceu de verdade. Ex. real: a OBRA 34 foi criada com R$ 3.125/m²
 * e terminou custando R$ 3.256/m² — repetir o 3.125 na obra seguinte é repetir
 * o erro.
 *
 * Devolve 0 quando não dá para saber (obra sem gasto lançado ou sem a metragem
 * das casas). Quem chama decide o que fazer nesse caso.
 *
 * ⚠️ Só é confiável se o terreno estiver na aba Terreno. Terreno lançado como
 * DESPESA entra aqui dentro e infla o custo de construção.
 */
export const custoM2Realizado = (project: Project): number => {
    const { gasto, areaTotal } = computeProjectFinance(project);
    if (!(areaTotal > 0) || !(gasto > 0)) return 0;
    return Math.round((gasto / areaTotal) * 100) / 100;
};

// ============================================================================
// Resultado POR UNIDADE — fonte única usada na aba Unidades e na aba Sócios
// (divisão por unidade). Mesma fórmula de rateio por área do custoRealVendidas.
// ============================================================================
export interface UnitResult {
    custoObra: number;        // custo de obra orçado da unidade (unit.cost)
    terrenoRateio: number;    // fatia do terreno/aquisição por área
    custoAlocado: number;     // custoObra + terrenoRateio (custo estimado da casa)
    custoRealizado: number;   // rateio por área do gasto real + terreno (usado quando concluída)
    venda: number;            // saleValue se vendida, senão valorEstimadoVenda
    vendida: boolean;
    resultado: number;        // venda − custo (real se concluída/vendida, senão estimado)
    isEstimado: boolean;      // true = resultado ainda é projeção (obra não concluída)
    progresso: number;        // progresso físico da obra (a casa avança junto)
}

export function computeUnitResult(project: Project, unit: Unit): UnitResult {
    const units = project.units || [];
    const totalUnitsArea = units.reduce((s, u) => s + (u.area || 0), 0);
    const terrenoTotal = (project.acquisitionCosts || []).reduce((s, a) => s + (a.value || 0), 0);
    const gastoTotal = (project.expenses || []).reduce((s, e) => s + (e.value || 0), 0);

    const areaShare = totalUnitsArea > 0 ? (unit.area || 0) / totalUnitsArea : 0;
    const terrenoRateio = areaShare * terrenoTotal;
    const custoObra = unit.cost || 0;
    const custoAlocado = custoObra + terrenoRateio;              // estimado (orçado + terreno)
    const custoRealizado = areaShare * gastoTotal + terrenoRateio; // real rateado + terreno

    const vendida = unit.status === 'Sold';
    const venda = vendida
        ? (unit.saleValue || 0)
        : (unit.valorEstimadoVenda && unit.valorEstimadoVenda > 0 ? unit.valorEstimadoVenda : (unit.saleValue || 0));

    const progresso = project.progress || 0;
    const isConcluida = progresso >= 100;
    // Enquanto a obra não conclui, o resultado é ESTIMADO (venda − custo orçado+terreno).
    // Concluída, usa o custo real rateado. Espelha o Projetado×Realizado do empreendimento.
    const isEstimado = !isConcluida;
    const custoParaResultado = isConcluida ? custoRealizado : custoAlocado;
    const resultado = venda - custoParaResultado;

    return { custoObra, terrenoRateio, custoAlocado, custoRealizado, venda, vendida, resultado, isEstimado, progresso };
}

// ============================================================================
// ACERTO DE APORTES — quanto cada sócio DEVERIA financiar (meta) × quanto já
// pôs, e o que falta. "Falta" é a própria chamada de aporte. Fonte única usada
// pelo app, pelo Portal (link) e pelo PDF.
//   - modo 'unit'   : meta = custo alocado da(s) casa(s) do sócio (obra + terreno)
//   - modo 'percent': meta = % renormalizado entre quem aporta × custo total.
//     Sócios com naoAporta (ex.: administrador) NÃO entram na conta de aporte.
// ============================================================================
export interface AporteShare {
    investorId?: string;
    name: string;
    meta: number;       // quanto deveria ter aportado no total
    aportado: number;   // dinheiro + despesas pagas do próprio bolso
    falta: number;      // meta − aportado (>0 precisa pôr; <0 adiantou)
}

export interface AporteAcerto {
    mode: 'percent' | 'unit';
    baseTotal: number;      // custo total que precisa ser financiado
    shares: AporteShare[];
    totalMeta: number;
    totalAportado: number;
    totalFalta: number;
    semBase: boolean;       // true = não dá pra calcular meta (sem cotas/casas definidas)
}

export function computeAporteShares(project: Project): AporteAcerto {
    const mode = project.splitMode === 'unit' ? 'unit' : 'percent';
    const contributions = project.contributions || [];
    const expenses = project.expenses || [];
    const units = project.units || [];
    const f = computeProjectFinance(project);
    const baseTotal = f.custoTotalEmpreendimento; // orçamento obra + aquisição

    // Quanto cada investidor já colocou (dinheiro + despesas pagas do bolso)
    const aportadoDe = (investorId?: string): number => {
        if (!investorId) return 0;
        const dinheiro = contributions.filter((c) => c.investorId === investorId).reduce((s, c) => s + (c.value || 0), 0);
        const viaDespesa = expenses.filter((e) => e.paidByInvestorId === investorId).reduce((s, e) => s + (e.value || 0), 0);
        return dinheiro + viaDespesa;
    };

    let shares: AporteShare[] = [];

    if (mode === 'unit') {
        const investors = project.investors || [];
        const donos = investors.filter((inv) => units.some((u) => u.ownerInvestorId === inv.id));
        shares = donos.map((inv) => {
            const meta = units
                .filter((u) => u.ownerInvestorId === inv.id)
                .reduce((s, u) => s + computeUnitResult(project, u).custoAlocado, 0);
            const aportado = aportadoDe(inv.id);
            return { investorId: inv.id, name: inv.name, meta, aportado, falta: meta - aportado };
        });
    } else {
        const contribuintes = (project.profitShares || []).filter((s) => !s.naoAporta && (s.percentage || 0) > 0);
        const totalPct = contribuintes.reduce((s, r) => s + (r.percentage || 0), 0);
        shares = contribuintes.map((s) => {
            const cota = totalPct > 0 ? (s.percentage || 0) / totalPct : 0;
            const meta = cota * baseTotal;
            const aportado = aportadoDe(s.investorId);
            return { investorId: s.investorId, name: s.name, meta, aportado, falta: meta - aportado };
        });
    }

    const totalMeta = shares.reduce((s, r) => s + r.meta, 0);
    const totalAportado = shares.reduce((s, r) => s + r.aportado, 0);
    const totalFalta = shares.reduce((s, r) => s + r.falta, 0);
    const semBase = shares.length === 0 || baseTotal <= 0;

    return { mode, baseTotal, shares, totalMeta, totalAportado, totalFalta, semBase };
}

// ============================================================================
// Veredito Gasto × Avanço — fonte ÚNICA usada pelo app, pelo Portal (link) e
// pelo PDF. `tone` é neutro (cada meio mapeia para suas cores).
// ============================================================================
export type GastoAvancoTone = 'neutral' | 'warning' | 'good';

export interface GastoAvancoVerdito {
    texto: string;
    icon: string;   // FontAwesome (usado no app e no link)
    tone: GastoAvancoTone;
}

export function computeGastoAvancoVerdito(f: ProjectFinance): GastoAvancoVerdito {
    const diff = f.gastoPct - f.progresso;
    if (f.gasto === 0 && f.progresso === 0) {
        return { texto: 'Obra ainda não iniciada', icon: 'fa-hourglass-start', tone: 'neutral' };
    }
    if (diff > 10) {
        return { texto: 'Gasto à frente do avanço da obra', icon: 'fa-triangle-exclamation', tone: 'warning' };
    }
    if (diff < -10) {
        return { texto: 'Obra à frente do gasto — eficiente', icon: 'fa-circle-check', tone: 'good' };
    }
    return { texto: 'Gasto alinhado ao avanço da obra', icon: 'fa-circle-check', tone: 'good' };
}
