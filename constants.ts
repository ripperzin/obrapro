
import { UserRole, ProgressStage, CONSTRUCTION_STAGES } from './types';

export const INITIAL_ADMIN = {
  id: 'admin-1',
  login: 'victoravila',
  password: '22031990',
  role: UserRole.ADMIN,
  plan: 'business' as const,
  allowedProjectIds: [],
  canSeeUnits: true
};

// Fronteiras de progresso (valores de cada etapa + concluída). Derivado das
// etapas padrão; obras com orçamento próprio usam getProjectStages(project).
export const PROGRESS_STAGES = [...CONSTRUCTION_STAGES.map((s) => s.value), ProgressStage.COMPLETED];

// BUDGET_STAGES foi REMOVIDO: dizia "DEVE espelhar o template no banco" e não
// espelhava mais (o banco ganhou a 9ª etapa, Canteiro, e reajustou os %), então
// a tela de Nova Obra mostrava uma régua que a obra não recebia. Quem precisa do
// preset lê do banco: hooks/useTemplateStages.
