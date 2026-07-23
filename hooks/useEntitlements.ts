import { useMemo } from 'react';
import { PlanId, User } from '../types';

/**
 * LUGAR ÚNICO que decide o que cada plano libera.
 *
 * Regra: nenhuma tela pergunta "o plano é free?" — ela pergunta "pode X?".
 * Quando mudar o que é pago, muda só este arquivo.
 *
 * Planos no lançamento: 'free' e 'pro' (rotulado "ObraPro" na tela).
 * 'business' fica reservado pro futuro e hoje libera tudo (é o dos donos).
 */
export interface Entitlements {
  plan: PlanId;
  isFree: boolean;

  /** Obras ativas ao mesmo tempo. Arquivada NÃO conta. */
  maxObrasAtivas: number;
  /** Sócios cadastrados por obra (o "Recursos próprios" já ocupa 1 no Free). */
  maxSocios: number;

  /** Itens de gasto: aba "Por item" + campo Item no lançamento. */
  canUseItens: boolean;
  /** Escanear comprovante (OCR). O servidor também barra — aqui é só a vitrine. */
  canUseOCR: boolean;
  /** Baixar o relatório em PDF. */
  canExportPdf: boolean;
  /** Link/PDF sem o selo "Feito com ObraPro". */
  canRemoveBranding: boolean;
  /** Link completo (extrato de despesas, resultado, aportes por sócio). */
  canShareFullReport: boolean;
  /** Cadastrar sócios individuais além do "Recursos próprios". */
  canUseInvestidoresIndividuais: boolean;
  /** Tela de Usuários (multiusuário). */
  canUseMultiusuario: boolean;
  /** Copiloto IA — hoje ninguém tem (fica pro Business). */
  canUseCopilotoIA: boolean;
}

const FREE: Omit<Entitlements, 'plan' | 'isFree'> = {
  maxObrasAtivas: 1,
  maxSocios: 1,
  canUseItens: false,
  canUseOCR: false,
  canExportPdf: false,
  canRemoveBranding: false,
  canShareFullReport: false,
  canUseInvestidoresIndividuais: false,
  canUseMultiusuario: false,
  canUseCopilotoIA: false,
};

const PRO: Omit<Entitlements, 'plan' | 'isFree'> = {
  maxObrasAtivas: 10,
  maxSocios: Infinity,
  canUseItens: true,
  canUseOCR: true,
  canExportPdf: true,
  canRemoveBranding: true,
  canShareFullReport: true,
  canUseInvestidoresIndividuais: true,
  canUseMultiusuario: true,
  canUseCopilotoIA: false, // Copiloto = Business/futuro.
};

const BUSINESS: Omit<Entitlements, 'plan' | 'isFree'> = {
  ...PRO,
  maxObrasAtivas: Infinity,
  canUseCopilotoIA: true,
};

const PLANS: Record<PlanId, Omit<Entitlements, 'plan' | 'isFree'>> = {
  free: FREE,
  pro: PRO,
  business: BUSINESS,
};

export const entitlementsFor = (plan: PlanId | undefined): Entitlements => {
  const p: PlanId = plan && PLANS[plan] ? plan : 'free'; // Sem plano = downgrade seguro.
  return { plan: p, isFree: p === 'free', ...PLANS[p] };
};

/**
 * Nome do plano como o usuário lê. É o ÚNICO lugar que traduz a etiqueta do
 * banco para a tela — 'pro' nunca aparece escrito, vira "ObraPro".
 * 'business' é etiqueta interna (admins): não é plano de venda, e por isso as
 * telas escondem o selo nesse caso em vez de escrever "Business".
 */
export const planLabel = (plan: PlanId): string =>
  plan === 'free' ? 'Free' : plan === 'pro' ? 'ObraPro' : 'Business';

/**
 * Plano EFETIVO = o que o app deve liberar hoje. É o plano-base do cliente, mas
 * se ele tem uma cortesia (trial_until) que ainda não venceu, vale ao menos
 * ObraPro. Vencida a cortesia, cai sozinho no plano-base — sem apagar nada.
 * O painel do dono mostra o plano-base + a cortesia separados; o app usa este.
 */
export const effectivePlan = (basePlan: unknown, trialUntil?: string | null): PlanId => {
  const base: PlanId = typeof basePlan === 'string' && PLANS[basePlan as PlanId] ? (basePlan as PlanId) : 'free';
  if (base !== 'free') return base;               // já é pago: cortesia não muda nada
  if (trialUntil) {
    const fim = new Date(trialUntil + 'T23:59:59');
    if (!isNaN(fim.getTime()) && fim.getTime() >= Date.now()) return 'pro';
  }
  return base;
};

export const useEntitlements = (user: User | null | undefined): Entitlements =>
  useMemo(() => entitlementsFor(user?.plan), [user?.plan]);
