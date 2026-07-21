
export enum UserRole {
  ADMIN = 'ADMIN',
  STANDARD = 'STANDARD'
}

// Plano do usuário (profiles.plan). ATENÇÃO aos nomes: o produto vende só DOIS
// planos — "Free" e "ObraPro". Aqui há três etiquetas porque o banco já nasceu
// assim (migration 20260611120000):
//   'free'     = Free
//   'pro'      = ObraPro  <- é ESTE que o cliente compra; a tela escreve "ObraPro"
//   'business' = etiqueta interna que libera tudo (é a dos admins/donos), e onde
//                um plano Business encaixaria no futuro sem mexer no banco.
// Nenhuma tela mostra 'pro'/'business' para o usuário.
export type PlanId = 'free' | 'pro' | 'business';

export const isPlanId = (v: unknown): v is PlanId =>
  v === 'free' || v === 'pro' || v === 'business';

export interface User {
  id: string;
  login: string;
  password?: string;
  role: UserRole;
  plan: PlanId;
  allowedProjectIds: string[];
  canSeeUnits: boolean;
}

// Âncoras semânticas do progresso. As 8 etapas ficam em CONSTRUCTION_STAGES.
// O VALOR de cada etapa = custo acumulado até o INÍCIO dela (0,4,16,...), então
// project.progress (0-100) já é o % ponderado por custo da obra concluída.
export enum ProgressStage {
  PLANNING = 0,
  COMPLETED = 100
}

// =====================================================
// ETAPAS DA OBRA — fonte única (progresso = orçamento = fotos)
// weight = % do custo da etapa (soma 100). value = acumulado no início da etapa.
// =====================================================
export interface ConstructionStage {
  value: number;   // project.progress ao ENTRAR nesta etapa (acumulado das anteriores)
  weight: number;  // % do custo desta etapa
  name: string;
  short: string;   // rótulo curto (mobile)
  icon: string;
}

export const CONSTRUCTION_STAGES: ConstructionStage[] = [
  { value: 0,  weight: 4,  name: 'Projetos e serviços preliminares',     short: 'Projetos',    icon: 'fa-clipboard-list' },
  { value: 4,  weight: 12, name: 'Terraplenagem e fundações',            short: 'Fundações',   icon: 'fa-mountain' },
  { value: 16, weight: 23, name: 'Estrutura e alvenaria',                short: 'Estrutura',   icon: 'fa-building' },
  { value: 39, weight: 9,  name: 'Cobertura e impermeabilização',        short: 'Cobertura',   icon: 'fa-house-chimney' },
  { value: 48, weight: 14, name: 'Instalações elétricas e hidráulicas',  short: 'Instalações', icon: 'fa-plug' },
  { value: 62, weight: 18, name: 'Revestimentos, pisos e forros',        short: 'Revestim.',   icon: 'fa-fill-drip' },
  { value: 80, weight: 15, name: 'Esquadrias, pintura e acabamentos',    short: 'Acabam.',     icon: 'fa-paint-roller' },
  { value: 95, weight: 5,  name: 'Área externa, ligações e entrega',     short: 'Entrega',     icon: 'fa-flag-checkered' },
];

export const STAGE_NAMES: Record<number, string> = {
  ...Object.fromEntries(CONSTRUCTION_STAGES.map((s) => [s.value, s.name])),
  100: 'Obra Concluída'
};

// Abbreviated names for mobile
export const STAGE_ABBREV: Record<number, string> = {
  ...Object.fromEntries(CONSTRUCTION_STAGES.map((s) => [s.value, s.short])),
  100: '✓'
};

// Icons for each stage
export const STAGE_ICONS: Record<number, string> = {
  ...Object.fromEntries(CONSTRUCTION_STAGES.map((s) => [s.value, s.icon])),
  100: 'fa-trophy'
};

// Etapa "atual" a partir do progresso (a de maior value <= progress).
export const getCurrentStage = (progress: number): ConstructionStage =>
  [...CONSTRUCTION_STAGES].reverse().find((s) => progress >= s.value) || CONSTRUCTION_STAGES[0];

// Deriva as etapas da OBRA a partir do orçamento (macros). Sem orçamento -> padrão.
// value = custo acumulado das etapas anteriores (0..100), então a barra de
// progresso fica ponderada pelo custo REAL da obra (editável no Orçamento).
// O mínimo que estas funções precisam saber de uma obra para montar a régua.
// Era repetido inteiro em cada assinatura — e ficou para trás quando `timeBased`
// nasceu. Um tipo só evita a próxima divergência.
type StageSource = {
  budget?: { macros?: { name: string; percentage: number; displayOrder: number; timeBased?: boolean }[] };
};

export const getProjectStages = (project?: StageSource): ConstructionStage[] => {
  const macros = project?.budget?.macros;
  if (!macros || macros.length === 0) return CONSTRUCTION_STAGES;
  // FORA DA RÉGUA DO AVANÇO: etapas `timeBased` (canteiro, container, água, luz)
  // não são fases que a obra atravessa — são custos que correm do início ao fim.
  // Elas continuam INTEIRAS no orçamento (o dinheiro não muda); só não viram
  // degrau do progresso, senão a obra "termina no canteiro". Mesma razão pela
  // qual elas atravessam o cronograma em vez de ganhar uma fatia — ver
  // utils/schedule.ts. As fases restantes renormalizam para 0–100 abaixo.
  const fases = macros.filter((m) => !m.timeBased);
  // Se só houver custo de tempo, não há régua a montar: cai no padrão.
  if (fases.length === 0) return CONSTRUCTION_STAGES;
  const sorted = [...fases].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  // NORMALIZA: as fronteiras sempre cabem em 0–100, mesmo que a soma dos % do
  // orçamento não feche 100 (ex: acabou de adicionar uma categoria). Assim
  // adicionar/editar categoria nunca quebra o stepper nem o avanço da obra.
  const totalPct = sorted.reduce((s, m) => s + (m.percentage || 0), 0);
  const useEqual = totalPct <= 0; // todas 0% → distribui igualmente
  const denom = useEqual ? sorted.length : totalPct;
  let acc = 0;
  return sorted.map((m, i) => {
    const w = useEqual ? 1 : (m.percentage || 0);
    const value = Math.round((acc / denom) * 100);
    acc += w;
    return {
      value,
      weight: Math.round((w / denom) * 100),
      name: m.name,
      short: CONSTRUCTION_STAGES[i]?.short || m.name.split(' ')[0],
      icon: CONSTRUCTION_STAGES[i]?.icon || 'fa-circle-dot',
    };
  });
};

// Índice da etapa atual (última com value <= progress). Concluída => stages.length.
export const getStageIndex = (stages: ConstructionStage[], progress: number): number => {
  if (progress >= 100) return stages.length;
  let idx = 0;
  for (let i = 0; i < stages.length; i++) if (progress >= stages[i].value) idx = i;
  return idx;
};

// Nome da etapa atual da obra (usa o orçamento se houver).
export const getStageName = (progress: number, project?: StageSource): string => {
  if (progress >= 100) return 'Obra Concluída';
  const stages = getProjectStages(project);
  return stages[getStageIndex(stages, progress)]?.name || '—';
};

// Evidência (foto) da ETAPA ATUAL da obra: dentro da FAIXA [início, próximo) que
// contém o progresso, a evidência COM foto de maior stage. Se a etapa atual não
// tem foto, retorna undefined — o card/link mostra placeholder e NÃO puxa a foto
// de uma etapa anterior. Obra concluída => faixa [100, 101), só entra foto
// marcada como 100. Mesma régua do herói da aba Gestão (evidenceInRange em
// ProjectDetail), pra o card, a tela da obra e o link baterem.
export const getCurrentStageEvidence = <E extends { stage: number; photos?: string[] }>(
  project: StageSource & { progress: number; stageEvidence?: E[] }
): E | undefined => {
  const stages = getProjectStages(project);
  const stageValues = [...stages.map((s) => s.value), 100];
  const idx = getStageIndex(stages, project.progress);
  const start = idx < stages.length ? stages[idx].value : 100;
  const end = stageValues[idx + 1] ?? 101;
  return (project.stageEvidence || [])
    .filter((e) => e.stage >= start && e.stage < end && (e.photos?.length ?? 0) > 0)
    .sort((a, b) => b.stage - a.stage)[0];
};

export const getCurrentStagePhoto = (
  project: StageSource & { progress: number; stageEvidence?: { stage: number; photos?: string[] }[] }
): string | undefined => getCurrentStageEvidence(project)?.photos?.[0];

export interface Unit {
  id: string;
  identifier: string;
  area: number;
  cost: number;
  status: 'Available' | 'Sold';
  valorEstimadoVenda?: number; // Campo novo opcional
  saleValue?: number;
  saleDate?: string;
  ownerInvestorId?: string; // Sócio "dono" desta unidade (divisão física); nulo = sem dono
}

// =====================================================
// SISTEMA DE ORÇAMENTO E MACRO-DESPESAS
// =====================================================

export interface CostTemplate {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdBy?: string;
}

export interface TemplateMacro {
  id: string;
  templateId: string;
  name: string;
  percentage: number;
  materialsHint?: string;
  laborHint?: string;
  displayOrder: number;
}

export interface ProjectBudget {
  id: string;
  projectId: string;
  totalEstimated: number;
  templateId?: string;
  createdAt?: string;
  totalValue?: number;
}

export interface ProjectMacro {
  id: string;
  budgetId: string;
  name: string;
  percentage: number;
  estimatedValue: number;
  spentValue: number;
  displayOrder: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  // true = não é uma FASE da obra, é custo que corre do início ao fim
  // (canteiro, container, água, luz). No cronograma atravessa a obra inteira
  // em vez de ganhar uma fatia do calendário. Ver utils/schedule.ts.
  timeBased?: boolean;
  subMacros?: ProjectSubMacro[];
}

export interface TemplateSubMacro {
  id: string;
  macroId: string;
  name: string;
  percentage: number;
  description?: string;
  displayOrder: number;
}

export interface ProjectSubMacro {
  id: string;
  projectMacroId: string;
  name: string;
  percentage: number;
  estimatedValue: number;
  spentValue: number;
  displayOrder: number;
}

// Item da obra: lista plana global ("o que comprei" — cimento, areia, frete...).
// Substitui o eixo submacro/"Detalhe" na despesa. É GLOBAL da obra (atravessa etapas).
export interface ProjectItem {
  id: string;
  projectId: string;
  name: string;
  displayOrder: number;
}

// Associação item↔etapa do template (preset MCMV): quais itens são típicos de
// cada etapa e o % Previsto dentro dela. Usado p/ sugerir itens no lançamento.
export interface TemplateStageItem {
  macroName: string;
  itemName: string;
  percentage: number;
  optional: boolean;
  displayOrder: number;
}

// =====================================================
// DESPESAS E LOGS
// =====================================================

export interface Expense {
  id: string;
  description: string;
  value: number;
  date: string;
  userId: string;
  userName: string;
  attachmentUrl?: string; // Legacy
  attachments?: string[]; // New
  macroId?: string;
  subMacroId?: string; // legado (submacro/"Detalhe") — sendo aposentado em favor de itemId
  itemId?: string; // item da obra (lista plana): "o que comprei"
  paidByInvestorId?: string; // Se preenchido: pago direto por esse sócio (não sai do caixa; vira aporte dele)
}

// =====================================================
// APORTES DE INVESTIDORES (controle de caixa da obra)
// =====================================================

export interface Investor {
  id: string;
  projectId: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt?: string;
}

export interface Contribution {
  id: string;
  projectId: string;
  investorId: string;
  value: number;
  date: string;
  description?: string;
  userId?: string;
  userName?: string;
  attachments?: string[];
  createdAt?: string;
}

// =====================================================
// AQUISIÇÃO DO EMPREENDIMENTO (terreno + custos iniciais)
// =====================================================

export type AcquisitionCategory = 'terreno' | 'escritura' | 'registro' | 'imposto' | 'comissao' | 'outros';

export const ACQUISITION_CATEGORY_LABELS: Record<AcquisitionCategory, string> = {
  terreno: 'Terreno',
  escritura: 'Escritura',
  registro: 'Registro',
  imposto: 'Impostos (ITBI etc.)',
  comissao: 'Comissão/Intermediação',
  outros: 'Outros custos iniciais',
};

export interface AcquisitionCost {
  id: string;
  projectId: string;
  category: AcquisitionCategory | string;
  description?: string;
  value: number;
  date: string;
  paidFromProject: boolean; // saiu do caixa da obra?
  attachments?: string[];
  userId?: string;
  userName?: string;
  createdAt?: string;
}

// Participação nos lucros (sócio) — separado dos aportes.
export interface ProfitShare {
  id: string;
  projectId: string;
  investorId?: string; // vínculo opcional a um investidor
  name: string;
  percentage: number;
  naoAporta?: boolean; // participa do lucro mas não aporta (ex.: administrador)
  createdAt?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export interface DiaryEntry {
  id: string;
  date: string;
  content: string;
  photos: string[]; // URLs das fotos
  author: string;
  createdAt: string;
}

export interface StageEvidence {
  stage: ProgressStage;
  photos: string[];
  date: string;
  notes?: string;
  user: string;
}

export interface ProjectDocument {
  id: string;
  title: string;
  category: 'Técnico' | 'Legal' | 'Financeiro' | 'Outros';
  url: string;
  createdAt: string;
}

export const DOCUMENT_CATEGORIES: ProjectDocument['category'][] = ['Técnico', 'Legal', 'Financeiro', 'Outros'];

// Cronograma de aportes: parcelas planejadas (data + quanto cada sócio põe).
// Uma parcela guarda os valores por investidor num mapa investorId -> valor.
// O "aporte antecipado" é só uma parcela com data anterior (label opcional).
export interface AporteParcela {
  id: string;
  date: string;                          // 'YYYY-MM-DD'
  label?: string;                        // ex.: "Aporte antecipado" (opcional)
  values: { [investorId: string]: number }; // valor planejado por sócio nesta parcela
  // Quando um sócio marca a parcela como PAGA, cria-se um aporte real (contribution)
  // e guarda-se o id dele aqui. Célula paga = tem id neste mapa. Desmarcar apaga o aporte.
  paidContrib?: { [investorId: string]: string };
}
export interface AportePlan {
  parcelas: AporteParcela[];
}

export interface Project {
  id: string;
  name: string;
  startDate?: string;      // Data de início da obra (YYYY-MM-DD)
  deliveryDate?: string;   // Data prevista de entrega (YYYY-MM-DD)
  unitCount: number;
  totalArea: number;
  expectedTotalCost: number;
  expectedTotalSales: number;
  custoM2?: number;        // Custo de referência por m² (base para recalcular custo das casas)
  financedByInvestorId?: string; // Pagador padrão: novas despesas nascem marcadas como pagas por esse sócio
  archived?: boolean;      // Obra arquivada: sai da lista ativa sem apagar os dados
  splitMode?: 'percent' | 'unit'; // Como a obra divide lucro/aporte: por % (padrão) ou por casa
  progress: ProgressStage;
  units: Unit[];
  expenses: Expense[];
  logs: LogEntry[];
  documents: ProjectDocument[];
  diary: DiaryEntry[];
  stageEvidence: StageEvidence[];
  budget?: ProjectBudget & { macros: ProjectMacro[] }; // Orçamento com macros
  investors?: Investor[];         // Investidores da obra
  contributions?: Contribution[]; // Aportes (capital que entrou)
  acquisitionCosts?: AcquisitionCost[]; // Aquisição do empreendimento (terreno etc.)
  profitShares?: ProfitShare[];         // Participação nos lucros (sócios)
  aportePlan?: AportePlan;              // Cronograma de aportes (parcelas planejadas por sócio)
}
