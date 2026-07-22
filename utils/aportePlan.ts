// Cronograma de aportes: gera as parcelas planejadas (automático) e cruza o
// planejado com o que cada sócio JÁ aportou. Funciona nos dois modos de divisão
// (% e por casa) porque parte da META por sócio, que o computeAporteShares já
// calcula certo nos dois.
import { AportePlan, AporteParcela, Project } from '../types';
import { AporteShare, computeAporteShares } from './projectFinance';
import { generateId } from '../utils';

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const toISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Gasto PLANEJADO da obra numa janela de tempo [from, to), distribuindo o valor
// de cada etapa LINEARMENTE pela sua duração planejada. Base do modo "ritmo" —
// funciona pra qualquer intervalo (não só mês).
const plannedSpendBetween = (project: Project, fromMs: number, toMs: number): number => {
  let total = 0;
  for (const m of project.budget?.macros || []) {
    if (!m.plannedStartDate || !m.plannedEndDate || !((m.estimatedValue || 0) > 0)) continue;
    const ms = new Date(m.plannedStartDate).getTime();
    const me = new Date(m.plannedEndDate).getTime();
    const dur = me - ms;
    if (dur <= 0) { if (ms >= fromMs && ms < toMs) total += m.estimatedValue || 0; continue; }
    const ov = Math.min(me, toMs) - Math.max(ms, fromMs);
    if (ov > 0) total += (m.estimatedValue || 0) * (ov / dur);
  }
  return total;
};

export interface AporteAutoOpts {
  mode: 'iguais' | 'ritmo';
  nParcelas: number;
  startDate: string;
  intervalDays: number;
}

// AUTOMÁTICO unificado: o ESQUELETO é o mesmo nos dois (nº de parcelas + intervalo
// + início). Muda só COMO reparte a meta de cada sócio:
//   - 'iguais': mesmo valor em cada parcela (como a planilha do Victor: total ÷ N).
//   - 'ritmo' : cada parcela pesa conforme o gasto planejado da obra NA JANELA
//               daquela parcela (respeita o intervalo escolhido, não mês fixo).
// A 1ª parcela abraça o gasto anterior e a última o que resta, então a soma sempre
// fecha a meta. Retorna null só se 'ritmo' e a obra não tem cronograma.
export const generateAporteSchedule = (
  shares: AporteShare[],
  project: Project,
  opts: AporteAutoOpts
): AportePlan | null => {
  const n = Math.max(1, Math.floor(opts.nParcelas));
  const start = new Date(opts.startDate + 'T00:00:00').getTime();
  const bounds = Array.from({ length: n }, (_, i) => start + i * opts.intervalDays * DAY);

  let weights: number[];
  if (opts.mode === 'ritmo') {
    weights = bounds.map((b, i) => {
      const from = i === 0 ? 0 : b;                                    // 1ª pega o gasto anterior
      const to = i < n - 1 ? bounds[i + 1] : Number.MAX_SAFE_INTEGER;  // última pega o que resta
      return plannedSpendBetween(project, from, to);
    });
    if (weights.reduce((a, b) => a + b, 0) <= 0) return null; // sem cronograma → nada pra pesar
  } else {
    weights = bounds.map(() => 1);
  }
  const sumW = weights.reduce((a, b) => a + b, 0);

  // Reparte a meta de cada sócio pelos pesos; fecha o arredondamento na última.
  const perShare = new Map<string, number[]>();
  shares.forEach((s) => {
    if (!s.investorId) return;
    const rounded = weights.map((w) => round2((w / sumW) * s.meta));
    const drift = round2(s.meta - rounded.reduce((a, b) => a + b, 0));
    rounded[n - 1] = round2(rounded[n - 1] + drift);
    perShare.set(s.investorId, rounded);
  });

  const parcelas: AporteParcela[] = bounds.map((b, i) => {
    const values: { [id: string]: number } = {};
    perShare.forEach((arr, id) => { values[id] = arr[i]; });
    return { id: generateId(), date: toISO(b), values };
  });
  return { parcelas };
};

// Total de uma parcela (soma de todos os sócios).
export const parcelaTotal = (p: AporteParcela): number =>
  round2(Object.values(p.values || {}).reduce((s, v) => s + (v || 0), 0));

export type AporteStatusTone = 'em_dia' | 'atrasado' | 'adiantado' | 'sem_plano';

export interface AporteStatusShare {
  investorId?: string;
  name: string;
  metaPlano: number;         // soma das parcelas planejadas do sócio
  planejadoAteHoje: number;  // parcelas dele com data <= hoje
  aportado: number;          // o que ele já pôs de verdade (dinheiro + despesa)
  diferenca: number;         // aportado - planejadoAteHoje (>0 adiantado, <0 atrasado)
  tone: AporteStatusTone;
}

// Cruza o cronograma com o realizado: quanto cada sócio DEVERIA ter aportado até
// hoje × quanto realmente aportou. Fonte única (app, link, PDF).
export const computeAporteScheduleStatus = (
  project: Project,
  plan: AportePlan | undefined,
  today: Date
): AporteStatusShare[] => {
  const acerto = computeAporteShares(project);
  const todayISO = toISO(today.getTime());
  const parcelas = plan?.parcelas || [];

  return acerto.shares.map((s) => {
    const id = s.investorId;
    let metaPlano = 0, planejadoAteHoje = 0;
    if (id) {
      for (const p of parcelas) {
        const v = p.values?.[id] || 0;
        metaPlano += v;
        if (p.date <= todayISO) planejadoAteHoje += v;
      }
    }
    const aportado = s.aportado;
    const diferenca = round2(aportado - planejadoAteHoje);
    let tone: AporteStatusTone = 'sem_plano';
    if (parcelas.length > 0 && id) {
      tone = diferenca < -1 ? 'atrasado' : diferenca > 1 ? 'adiantado' : 'em_dia';
    }
    return { investorId: id, name: s.name, metaPlano: round2(metaPlano), planejadoAteHoje: round2(planejadoAteHoje), aportado: round2(aportado), diferenca, tone };
  });
};

// ============================================================================
// MATRIZ de aportes — fonte ÚNICA das linhas usadas pelo app (AporteScheduleSection),
// pelo link do sócio (InvestorView) e pelo PDF. Se cada um montasse as linhas por
// conta, os três divergiriam com o tempo; aqui eles divergem só no visual.
// ============================================================================
export interface AporteMatrixCell {
  value: number;          // valor da célula (planejado, ou real se pago/avulso/despesa)
  planejado?: number;     // só em linha de plano: o que estava previsto (p/ mostrar "plan. X")
  pago?: boolean;         // linha de plano: já virou aporte de verdade
  anexos: string[];       // comprovantes
  notas: string[];        // descrições dos lançamentos
  contribIds: string[];   // aportes que formam a célula (o app usa p/ apagar avulso)
}
export interface AporteMatrixRow {
  kind: 'plan' | 'avulso' | 'despesa';
  key: string;
  date: string;                       // 'YYYY-MM-DD' — chave de ordenação e exibição
  ym?: string;                        // só 'despesa': o mês agrupado
  qtd?: number;                       // só 'despesa': quantos lançamentos no mês
  parcela?: AporteParcela;            // só 'plan': a parcela original (edição no app)
  cells: { [investorId: string]: AporteMatrixCell };
}
export interface AporteMatrix {
  rows: AporteMatrixRow[];
  /** Dinheiro de quem NÃO tem coluna na matriz (sem cota / sem casa / "Recursos próprios"). */
  foraDaMatriz: { total: number; nomes: string[] };
}

/**
 * Monta as linhas da matriz Data × Sócios.
 * `parcelas` vem de fora (e não de `project.aportePlan`) porque no app a tabela
 * mostra o plano em EDIÇÃO, que ainda não foi salvo no projeto.
 */
export const buildAporteMatrix = (
  project: Project,
  parcelas: AporteParcela[],
  colunas: string[]        // investorIds que têm coluna
): AporteMatrix => {
  const temColuna = new Set(colunas);
  const novaCell = (): AporteMatrixCell => ({ value: 0, anexos: [], notas: [], contribIds: [] });

  const contribById = new Map<string, any>();
  (project.contributions || []).forEach((c: any) => { if (c.id) contribById.set(c.id, c); });

  // --- linhas do PLANO (com o valor real quando a célula já foi paga)
  const planRows: AporteMatrixRow[] = parcelas.map((p) => {
    const cells: { [id: string]: AporteMatrixCell } = {};
    for (const sid of colunas) {
      const planejado = p.values?.[sid] || 0;
      const contribId = p.paidContrib?.[sid];
      const real = contribId ? contribById.get(contribId) : undefined;
      if (!planejado && !real) continue;
      cells[sid] = {
        value: real ? real.value || 0 : planejado,
        planejado,
        pago: !!contribId,
        anexos: (real?.attachments || []).filter(Boolean),
        notas: real?.description ? [real.description] : [],
        contribIds: contribId ? [contribId] : [],
      };
    }
    return { kind: 'plan', key: p.id, date: p.date, parcela: p, cells };
  });

  // --- aportes AVULSOS (dinheiro que não está preso a nenhuma parcela), por data
  const ligados = new Set<string>();
  parcelas.forEach((p) => Object.values(p.paidContrib || {}).forEach((id) => id && ligados.add(id)));
  const porData = new Map<string, { [id: string]: AporteMatrixCell }>();
  (project.contributions || []).forEach((c: any) => {
    if (!c.id || !c.investorId || ligados.has(c.id) || !temColuna.has(c.investorId)) return;
    const d = (c.date || '').slice(0, 10) || '—';
    if (!porData.has(d)) porData.set(d, {});
    const linha = porData.get(d)!;
    if (!linha[c.investorId]) linha[c.investorId] = novaCell();
    linha[c.investorId].value += c.value || 0;
    linha[c.investorId].contribIds.push(c.id);
    (c.attachments || []).forEach((a: string) => a && linha[c.investorId].anexos.push(a));
    if (c.description) linha[c.investorId].notas.push(c.description);
  });
  const avulsoRows: AporteMatrixRow[] = [...porData.entries()].map(([date, cells], i) => ({
    kind: 'avulso', key: `av-${date}-${i}`, date, cells,
  }));

  // --- despesa que o sócio pagou do bolso: também é aporte. Agrupada por MÊS
  //     (há obra com 151 lançamentos — uma linha por despesa afogaria a tabela).
  const porMes = new Map<string, { cells: { [id: string]: AporteMatrixCell }; qtd: number }>();
  (project.expenses || []).forEach((e: any) => {
    const sid = e.paidByInvestorId;
    if (!sid || !temColuna.has(sid)) return;
    const ym = (e.date || '').slice(0, 7);
    if (!ym) return;
    if (!porMes.has(ym)) porMes.set(ym, { cells: {}, qtd: 0 });
    const g = porMes.get(ym)!;
    if (!g.cells[sid]) g.cells[sid] = novaCell();
    g.cells[sid].value += e.value || 0;
    g.qtd += 1;
  });
  const despesaRows: AporteMatrixRow[] = [...porMes.entries()].map(([ym, g]) => ({
    kind: 'despesa', key: `ds-${ym}`, date: `${ym}-31`, ym, qtd: g.qtd, cells: g.cells,
  }));

  // --- rede de segurança: dinheiro de quem ficou de fora das colunas
  const porSocioFora = new Map<string, number>();
  (project.contributions || []).forEach((c: any) => {
    if (!c.investorId || temColuna.has(c.investorId)) return;
    porSocioFora.set(c.investorId, (porSocioFora.get(c.investorId) || 0) + (c.value || 0));
  });
  (project.expenses || []).forEach((e: any) => {
    if (!e.paidByInvestorId || temColuna.has(e.paidByInvestorId)) return;
    porSocioFora.set(e.paidByInvestorId, (porSocioFora.get(e.paidByInvestorId) || 0) + (e.value || 0));
  });

  return {
    rows: [...planRows, ...avulsoRows, ...despesaRows].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    foraDaMatriz: {
      total: round2([...porSocioFora.values()].reduce((s, v) => s + v, 0)),
      nomes: [...porSocioFora.keys()].map((id) => (project.investors || []).find((i) => i.id === id)?.name || 'sócio sem nome'),
    },
  };
};

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2026-02' -> 'fev/26' */
export const labelMesAporte = (ym: string): string => {
  const [y, m] = (ym || '').split('-');
  return `${MESES_CURTOS[(parseInt(m) || 1) - 1]}/${(y || '').slice(2)}`;
};
