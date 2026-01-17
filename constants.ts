
import { UserRole, ProgressStage } from './types';

export const INITIAL_ADMIN = {
  id: 'admin-1',
  login: 'victoravila',
  password: '22031990',
  role: UserRole.ADMIN,
  allowedProjectIds: [],
  canSeeUnits: true
};

export const PROGRESS_STAGES = [
  ProgressStage.PLANNING,
  ProgressStage.FOUNDATION,
  ProgressStage.STRUCTURE,
  ProgressStage.BRICKWORK,
  ProgressStage.ROOFING,
  ProgressStage.ROUGH_INSTALLS,
  ProgressStage.INTERNAL_FINISH,
  ProgressStage.DOORS_WINDOWS,
  ProgressStage.FINAL_DETAILS,
  ProgressStage.FINISHING,
  ProgressStage.COMPLETED
];
