import { useMemo } from 'react';
import { PlanId, User } from '../types';

/**
 * LUGAR ÚNICO que decide o que cada plano libera.
 *
 * Regra: nenhuma tela pergunta "o plano é free?" — ela pergunta "pode X?".
 * Quando mudar o que é pago, muda só este arquivo.
 *
 * Planos: 'free' = Grátis · 'pro' = Completo · 'business' = Construtora.
 * (As etiquetas do banco NÃO mudam — só o nome que aparece na tela.)
 */
export interface Entitlements {
  plan: PlanId;
  isFree: boolean;

  /** Obras ativas ao mesmo tempo. Arquivada NÃO conta. */
  maxObrasAtivas: number;
  /** Sócios cadastrados por obra (o "Recursos próprios" já ocupa 1 no Free). */
  maxSocios: number;

  /** Anotar o item no lançamento (dropdown). GRÁTIS pra todos — assim ninguém
   *  acumula histórico cego. O que é pago é a ANÁLISE (canAnalyzeItens). */
  canLogItens: boolean;
  /** Analisar item: aba "Por item" (previsto × real) no orçamento e no link.
   *  É o recurso pago — acende de uma vez o histórico que o grátis já anotava. */
  canAnalyzeItens: boolean;
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
  /** Equipe: adicionar funcionários (com cargos) na obra. Só no Ilimitado. */
  canUseMultiusuario: boolean;
  /** Copiloto IA — só no Ilimitado. */
  canUseCopilotoIA: boolean;
}

const FREE: Omit<Entitlements, 'plan' | 'isFree'> = {
  maxObrasAtivas: 1,
  maxSocios: 1,
  canLogItens: true,      // anotar item é grátis (histórico não nasce cego)
  canAnalyzeItens: false, // a análise previsto × real é paga
  canUseOCR: false,
  canExportPdf: false,
  canRemoveBranding: false,
  canShareFullReport: false,
  canUseInvestidoresIndividuais: false,
  canUseMultiusuario: false,
  canUseCopilotoIA: false,
};

const PRO: Omit<Entitlements, 'plan' | 'isFree'> = {
  maxObrasAtivas: 4,
  maxSocios: Infinity,
  canLogItens: true,
  canAnalyzeItens: true,
  canUseOCR: true,
  canExportPdf: true,
  canRemoveBranding: true,
  canShareFullReport: true,
  canUseInvestidoresIndividuais: true,
  canUseMultiusuario: false, // Equipe (funcionários) = só no Ilimitado.
  canUseCopilotoIA: false,   // Copiloto = só no Ilimitado.
};

const BUSINESS: Omit<Entitlements, 'plan' | 'isFree'> = {
  ...PRO,
  maxObrasAtivas: Infinity,
  canUseMultiusuario: true, // funcionários com cargos
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
 * banco para a tela: 'free' → Grátis · 'pro' → Completo · 'business' → Construtora.
 * (As etiquetas do banco não mudam — nenhuma tela escreve 'pro'/'business'.)
 */
export const planLabel = (plan: PlanId): string =>
  plan === 'free' ? 'Grátis' : plan === 'pro' ? 'Completo' : 'Construtora';

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
