
export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`;
};

export const generateId = () => crypto.randomUUID();

export const calculateMonthsBetween = (d1: string, d2: string) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  let months = (date2.getFullYear() - date1.getFullYear()) * 12;
  months -= date1.getMonth();
  months += date2.getMonth();
  return months <= 0 ? 0.001 : months; // Avoid division by zero
};
