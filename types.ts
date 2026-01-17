
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
  FOUNDATION = 10,
  STRUCTURE = 20,
  BRICKWORK = 30,
  ROOFING = 40,
  ROUGH_INSTALLS = 50,
  INTERNAL_FINISH = 60,
  DOORS_WINDOWS = 70,
  FINAL_DETAILS = 80,
  FINISHING = 90,
  COMPLETED = 100
}

export const STAGE_NAMES: Record<number, string> = {
  0: 'Planejamento',
  10: 'Fundação',
  20: 'Estrutura',
  30: 'Alvenaria',
  40: 'Cobertura',
  50: 'Instalações Brutas',
  60: 'Revestimentos Internos',
  70: 'Esquadrias',
  80: 'Acabamentos',
  90: 'Finalização',
  100: 'Obra Concluída'
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

export interface Expense {
  id: string;
  description: string;
  value: number;
  date: string;
  userId: string;
  userName: string;
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

export interface Project {
  id: string;
  name: string;
  unitCount: number;
  totalArea: number;
  expectedTotalCost: number;
  expectedTotalSales: number;
  progress: ProgressStage;
  units: Unit[];
  expenses: Expense[];
  logs: LogEntry[];
}
