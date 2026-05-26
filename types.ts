
export enum UserRole {
  ADMIN = 'ADMIN',
  STANDARD = 'STANDARD'
}

export interface User {
  id: string;
  login: string;
  password?: string;
  role: UserRole;
  allowedProjectIds: string[];
  canSeeUnits: boolean;
}

export enum ProgressStage {
  PLANNING = 0,
  FOUNDATION = 15,
  STRUCTURE = 30,
  ELECTRICAL_PLUMBING = 60,
  FINISHING_DETAILS = 75,
  FINISHING = 90,
  COMPLETED = 100
}

export const STAGE_NAMES: Record<number, string> = {
  0: 'Planejamento',
  15: 'Fundação',
  30: 'Estrutura e Alvenaria',
  60: 'Elétrica e Hidráulica',
  75: 'Acabamentos (Vidros, Pisos e Pintura)',
  90: 'Finalização',
  100: 'Obra Concluída'
};

// Abbreviated names for mobile
export const STAGE_ABBREV: Record<number, string> = {
  0: 'PLN',
  15: 'FUN',
  30: 'EST',
  60: 'ELE',
  75: 'ACAB',
  90: 'FIN',
  100: '✓'
};

// Icons for each stage
export const STAGE_ICONS: Record<number, string> = {
  0: 'fa-clipboard-list',
  15: 'fa-mountain',
  30: 'fa-building',
  60: 'fa-plug',
  75: 'fa-paint-roller',
  90: 'fa-flag-checkered',
  100: 'fa-trophy'
};

export interface Unit {
  id: string;
  identifier: string;
  area: number;
  cost: number;
  status: 'Available' | 'Sold';
  valorEstimadoVenda?: number; // Campo novo opcional
  saleValue?: number;
  saleDate?: string;
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
  subMacroId?: string;
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

export interface Project {
  id: string;
  name: string;
  startDate?: string;      // Data de início da obra (YYYY-MM-DD)
  deliveryDate?: string;   // Data prevista de entrega (YYYY-MM-DD)
  unitCount: number;
  totalArea: number;
  expectedTotalCost: number;
  expectedTotalSales: number;
  progress: ProgressStage;
  units: Unit[];
  expenses: Expense[];
  logs: LogEntry[];
  documents: ProjectDocument[];
  diary: DiaryEntry[];
  stageEvidence: StageEvidence[];
  budget?: ProjectBudget & { macros: ProjectMacro[] }; // Orçamento com macros
}
