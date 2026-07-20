// Exporta as despesas da obra para uma planilha Excel (.xlsx).
// Espelha o que a tela mostra: Data · Descrição · Valor · Etapa · Item · Pago por.
// A biblioteca xlsx (SheetJS) já vem no projeto pelo importador de despesas.
import * as XLSX from 'xlsx';

export interface ExpenseExportRow {
  Data: string;      // dd/mm/aaaa (ou vazio quando a despesa não tem data)
  Descrição: string;
  Valor: number;     // número puro, pra somar no Excel
  Etapa: string;
  Item: string;
  'Pago por': string; // nome do sócio ou "Caixa da obra"
}

// 'YYYY-MM-DD' (ou ISO) -> 'dd/mm/aaaa'. Data vazia/ inválida -> ''.
export const formatDateBR = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
};

// Nome de arquivo seguro: sem os caracteres que o Windows/macOS proíbem.
const safeFileName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'obra';

// Monta a planilha e dispara o download no navegador.
export const exportExpensesToXlsx = (rows: ExpenseExportRow[], projectName: string): void => {
  const ws = XLSX.utils.json_to_sheet(rows);
  // Larguras de coluna (em caracteres) pra planilha nascer legível.
  ws['!cols'] = [
    { wch: 12 }, // Data
    { wch: 42 }, // Descrição
    { wch: 14 }, // Valor
    { wch: 30 }, // Etapa
    { wch: 26 }, // Item
    { wch: 22 }, // Pago por
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas');
  XLSX.writeFile(wb, `Despesas - ${safeFileName(projectName)}.xlsx`);
};
