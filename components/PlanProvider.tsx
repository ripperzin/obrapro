import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { User } from '../types';
import { Entitlements, entitlementsFor } from '../hooks/useEntitlements';
import UpgradeModal, { UpgradeFeature } from './UpgradeModal';

/**
 * Entrega o plano do usuário para o app inteiro e é dono do convite de upgrade.
 *
 * Qualquer tela faz:
 *   const { ent, openUpgrade } = usePlan();
 *   if (!ent.canUseItens) return <botão com cadeado onClick={() => openUpgrade('itens')} />
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

export const PlanProvider: React.FC<{ user: User | null; children: React.ReactNode }> = ({ user, children }) => {
  const [feature, setFeature] = useState<UpgradeFeature | null>(null);

  const openUpgrade = useCallback((f: UpgradeFeature) => setFeature(f), []);

  const value = useMemo<PlanContextValue>(
    () => ({ ent: entitlementsFor(user?.plan), openUpgrade }),
    [user?.plan, openUpgrade]
  );

  return (
    <PlanContext.Provider value={value}>
      {children}
      {feature && <UpgradeModal feature={feature} onClose={() => setFeature(null)} />}
    </PlanContext.Provider>
  );
};
