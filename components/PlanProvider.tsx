import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { User, PlanId } from '../types';
import { Entitlements, entitlementsFor } from '../hooks/useEntitlements';
import UpgradeModal, { UpgradeFeature } from './UpgradeModal';

/**
 * Entrega o plano do usuário para o app inteiro e é dono do convite de upgrade.
 *
 * Qualquer tela faz:
 *   const { ent, openUpgrade } = usePlan();
 *   if (!ent.canAnalyzeItens) return <botão com cadeado onClick={() => openUpgrade('itens')} />
 *
 * Assim nenhuma tela precisa receber o plano por prop nem montar o modal.
 */
interface PlanContextValue {
  ent: Entitlements;
  openUpgrade: (feature: UpgradeFeature) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export const usePlan = (): PlanContextValue => {
  const ctx = useContext(PlanContext);
  // Sem provider = downgrade seguro (nada liberado) em vez de quebrar a tela.
  if (!ctx) return { ent: entitlementsFor('free'), openUpgrade: () => {} };
  return ctx;
};

// planOverride: quando presente, o `ent` segue ESTE plano em vez do plano do
// usuário logado. Usado pra aninhar um provider em volta da OBRA aberta com o
// plano do DONO dela — assim o funcionário (free) usa as features do plano do
// patrão DENTRO da obra, sem herdar features de conta (equipe/copiloto), que
// ficam no provider global (plano do próprio usuário).
export const PlanProvider: React.FC<{ user: User | null; planOverride?: PlanId; children: React.ReactNode }> = ({ user, planOverride, children }) => {
  const [feature, setFeature] = useState<UpgradeFeature | null>(null);

  const openUpgrade = useCallback((f: UpgradeFeature) => setFeature(f), []);

  const value = useMemo<PlanContextValue>(
    () => ({ ent: entitlementsFor(planOverride ?? user?.plan), openUpgrade }),
    [planOverride, user?.plan, openUpgrade]
  );

  return (
    <PlanContext.Provider value={value}>
      {children}
      {feature && <UpgradeModal feature={feature} currentPlan={value.ent.plan} onClose={() => setFeature(null)} />}
    </PlanContext.Provider>
  );
};
