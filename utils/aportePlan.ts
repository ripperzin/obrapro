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

// Distribui um total em n partes, jogando a sobra do arredondamento na última
// (assim a soma das parcelas fecha EXATO com a meta, sem centavos perdidos).
const splitEqual = (total: number, n: number): number[] => {
  if (n <= 0) return [];
  const per = round2(total / n);
  const out = Array(n).fill(per);
  out[n - 1] = round2(total - per * (n - 1));
  return out;
};

// AUTOMÁTICO 1 — parcelas IGUAIS: cada sócio paga a meta dele em n parcelas
// iguais, a partir de startDate, espaçadas de intervalDays (como a planilha do
// Victor: total ÷ 10). O usuário edita depois (ex.: aporte antecipado).
export const generateAporteScheduleEqual = (
  shares: AporteShare[],
  opts: { nParcelas: number; startDate: string; intervalDays: number }
): AportePlan => {
  const n = Math.max(1, Math.floor(opts.nParcelas));
  const start = new Date(opts.startDate + 'T00:00:00').getTime();
  const perShare = new Map<string, number[]>();
  shares.forEach((s) => { if (s.investorId) perShare.set(s.investorId, splitEqual(s.meta, n)); });

  const parcelas: AporteParcela[] = [];
  for (let i = 0; i < n; i++) {
    const values: { [id: string]: number } = {};
    perShare.forEach((arr, id) => { values[id] = arr[i]; });
    parcelas.push({ id: generateId(), date: toISO(start + i * opts.intervalDays * DAY), values });
  }
  return { parcelas };
};

// Gasto PLANEJADO por mês, a partir das datas do cronograma da obra (mesma conta
// da tela Cronograma). Base do automático "pelo ritmo".
const monthlyPlannedSpend = (project: Project): { date: string; total: number }[] => {
  const macros = (project.budget?.macros || []).filter(
    (m) => m.plannedStartDate && m.plannedEndDate && (m.estimatedValue || 0) > 0
  );
  if (macros.length === 0) return [];
  const starts = macros.map((m) => new Date(m.plannedStartDate as string).getTime());
  const ends = macros.map((m) => new Date(m.plannedEndDate as string).getTime());
  const min = new Date(Math.min(...starts)), max = new Date(Math.max(...ends));

  const out: { date: string; total: number }[] = [];
  let cur = new Date(min.getFullYear(), min.getMonth(), 1);
  const limit = new Date(max.getFullYear(), max.getMonth(), 1);
  while (cur <= limit) {
    let total = 0;
    for (const m of macros) {
      const s = new Date(m.plannedStartDate as string), e = new Date(m.plannedEndDate as string);
      const sc = new Date(s.getFullYear(), s.getMonth(), 1), ec = new Date(e.getFullYear(), e.getMonth(), 1);
      if (cur >= sc && cur <= ec) {
        let dur = (e.getFullYear() - s.getFullYear()) * 12 - s.getMonth() + e.getMonth() + 1;
        if (dur <= 0) dur = 1;
        total += (m.estimatedValue || 0) / dur;
      }
    }
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    out.push({ date: `${ym}-05`, total });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
};

// AUTOMÁTICO 2 — pelo RITMO da obra: uma parcela por mês, e cada sócio põe a
// fatia da meta dele proporcional ao que a obra gasta naquele mês (mês que gasta
// mais pede mais aporte). Retorna null se a obra não tem cronograma gerado.
export const generateAporteScheduleByRitmo = (
  project: Project,
  shares: AporteShare[]
): AportePlan | null => {
  const months = monthlyPlannedSpend(project);
  const totalSpend = months.reduce((s, m) => s + m.total, 0);
  if (months.length === 0 || totalSpend <= 0) return null;

  // Para cada sócio, reparte a meta pelos pesos mensais (soma fecha a meta).
  const perShare = new Map<string, number[]>();
  shares.forEach((s) => {
    if (!s.investorId) return;
    const raw = months.map((m) => (m.total / totalSpend) * s.meta);
    // fecha o arredondamento na última parcela
    const rounded = raw.map(round2);
    const drift = round2(s.meta - rounded.reduce((a, b) => a + b, 0));
    rounded[rounded.length - 1] = round2(rounded[rounded.length - 1] + drift);
    perShare.set(s.investorId, rounded);
  });

  const parcelas: AporteParcela[] = months.map((m, i) => {
    const values: { [id: string]: number } = {};
    perShare.forEach((arr, id) => { values[id] = arr[i]; });
    return { id: generateId(), date: m.date, values };
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
