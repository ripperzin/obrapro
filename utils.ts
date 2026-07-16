
export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Abbreviated currency for mobile (e.g., 1,4M, 977k, -977k). Trata negativos e mantém o sinal.
export const formatCurrencyAbbrev = (value: number) => {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    return `${sign}${(abs / 1000000).toFixed(1).replace('.', ',')}M`;
  } else if (abs >= 1000) {
    return `${sign}${Math.round(abs / 1000)}k`;
  }
  return `${sign}${Math.round(abs)}`;
};

export const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`;
};

export const generateId = () => {
  // Fallback para contextos não seguros (HTTP)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // UUID v4 alternativo
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Status de prazo da obra para os cards (entrega + selo No prazo/Atrasada/Concluída/Sem prazo).
export type DeliveryTone = 'green' | 'red' | 'blue' | 'slate';
export interface DeliveryStatus {
  label: string;            // "Concluída" | "Atrasada" | "No prazo" | "Sem prazo"
  tone: DeliveryTone;
  dateLabel: string | null; // "mai/2027"
  detail: string | null;    // "faltam 8 meses" | "2 meses de atraso" | "entrega este mês"
}

const monthYearLabel = (d: Date) =>
  d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('. de ', '/').replace('.', '');

export const getDeliveryStatus = (deliveryDate?: string, progress: number = 0): DeliveryStatus => {
  const dateLabel = deliveryDate ? monthYearLabel(new Date(deliveryDate + 'T00:00:00')) : null;
  if (progress >= 100) return { label: 'Concluída', tone: 'green', dateLabel, detail: null };
  if (!deliveryDate) return { label: 'Sem prazo', tone: 'slate', dateLabel: null, detail: null };

  const d = new Date(deliveryDate + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const DAY = 1000 * 60 * 60 * 24;

  if (d.getTime() < now.getTime()) {
    const meses = Math.max(1, Math.round((now.getTime() - d.getTime()) / (DAY * 30)));
    return { label: 'Atrasada', tone: 'red', dateLabel, detail: `${meses} ${meses === 1 ? 'mês' : 'meses'} de atraso` };
  }
  const meses = Math.round((d.getTime() - now.getTime()) / (DAY * 30));
  return {
    label: 'No prazo',
    tone: 'blue',
    dateLabel,
    detail: meses <= 0 ? 'entrega este mês' : `faltam ${meses} ${meses === 1 ? 'mês' : 'meses'}`,
  };
};

// Dias desde uma data (aceita 'YYYY-MM-DD' ou ISO). 0 = hoje.
export const daysSince = (iso: string): number => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00').getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - d) / (1000 * 60 * 60 * 24));
};

// Rótulo "Atualizada há X" a partir do número de dias.
export const lastUpdatedLabel = (days: number): string => {
  if (days <= 0) return 'Atualizada hoje';
  if (days === 1) return 'Atualizada ontem';
  if (days < 7) return `Atualizada há ${days} dias`;
  if (days < 14) return 'Atualizada há 1 semana';
  if (days < 30) return `Atualizada há ${Math.floor(days / 7)} semanas`;
  if (days < 60) return 'Atualizada há 1 mês';
  return `Atualizada há ${Math.floor(days / 30)} meses`;
};

// Data mais recente (YYYY-MM-DD) de uma lista; null se vazia.
export const mostRecentDate = (dates: (string | undefined | null)[]): string | null => {
  const norm = dates.filter(Boolean).map(d => (d as string).slice(0, 10)).sort();
  return norm.length ? norm[norm.length - 1] : null;
};

export const calculateMonthsBetween = (d1: string, d2: string) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  let months = (date2.getFullYear() - date1.getFullYear()) * 12;
  months -= date1.getMonth();
  months += date2.getMonth();
  return months <= 0 ? 0.001 : months; // Avoid division by zero
};
