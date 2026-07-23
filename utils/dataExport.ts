// Exporta TODOS os dados de uma obra numa planilha Excel de várias abas.
// É a portabilidade de dados do cliente (LGPD): "seus dados são seus, leve-os".
// Reaproveita a mesma biblioteca (SheetJS) do importador/exportador de despesas.
import * as XLSX from 'xlsx';
import { Project, getStageName } from '../types';
import { computeProjectFinance, computeAporteShares } from './projectFinance';
import { formatDateBR } from './expenseExport';

const safeFileName = (name: string): string =>
  name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'obra';

const fitCols = (ws: XLSX.WorkSheet, widths: number[]) => { ws['!cols'] = widths.map((w) => ({ wch: w })); };

// Monta o workbook (abas) de UMA obra. Cada aba espelha o que o cliente vê no app.
export const buildProjectWorkbook = (project: Project): XLSX.WorkBook => {
  const wb = XLSX.utils.book_new();
  const investorName = (id?: string) => (project.investors || []).find((i) => i.id === id)?.name || '';
  const macroName = (id?: string) => (project.budget?.macros || []).find((m) => m.id === id)?.name || '';

  // --- Despesas
  const despesas = [...(project.expenses || [])]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((e) => ({
      Data: formatDateBR(e.date),
      Descrição: e.description || '',
      Valor: e.value || 0,
      Etapa: macroName(e.macroId),
      'Pago por': e.paidByInvestorId ? investorName(e.paidByInvestorId) : 'Caixa da obra',
    }));
  const wsD = XLSX.utils.json_to_sheet(despesas.length ? despesas : [{ Data: '', Descrição: 'Sem despesas', Valor: 0, Etapa: '', 'Pago por': '' }]);
  fitCols(wsD, [12, 42, 14, 28, 22]);
  XLSX.utils.book_append_sheet(wb, wsD, 'Despesas');

  // --- Unidades / vendas
  const unidades = (project.units || []).map((u) => ({
    Unidade: u.identifier,
    'Área (m²)': u.area || 0,
    'Custo orçado': u.cost || 0,
    Status: u.status === 'Sold' ? 'Vendida' : 'À venda',
    'Valor de venda': u.saleValue || u.valorEstimadoVenda || 0,
    'Data da venda': formatDateBR(u.saleDate),
    Dono: investorName(u.ownerInvestorId),
  }));
  if (unidades.length) {
    const wsU = XLSX.utils.json_to_sheet(unidades);
    fitCols(wsU, [16, 10, 14, 10, 16, 14, 22]);
    XLSX.utils.book_append_sheet(wb, wsU, 'Unidades');
  }

  // --- Aportes dos sócios (acerto: meta · aportou · falta)
  const acerto = computeAporteShares(project);
  if (!acerto.semBase && acerto.shares.length) {
    const aportes = acerto.shares.map((s) => ({
      Sócio: s.name,
      Meta: s.meta,
      Aportou: s.aportado,
      Falta: s.falta > 0 ? s.falta : 0,
    }));
    const wsA = XLSX.utils.json_to_sheet(aportes);
    fitCols(wsA, [24, 16, 16, 16]);
    XLSX.utils.book_append_sheet(wb, wsA, 'Aportes');
  }

  // --- Orçamento por etapa (previsto × gasto)
  const macros = (project.budget?.macros || []).map((m) => ({
    Etapa: m.name,
    Previsto: m.estimatedValue || 0,
    Gasto: m.spentValue || 0,
    'Saldo': (m.estimatedValue || 0) - (m.spentValue || 0),
  }));
  if (macros.length) {
    const wsO = XLSX.utils.json_to_sheet(macros);
    fitCols(wsO, [30, 16, 16, 16]);
    XLSX.utils.book_append_sheet(wb, wsO, 'Orçamento');
  }

  // --- Diário de obra (texto)
  const diario = [...(project.diary || [])]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map((d) => ({ Data: formatDateBR(d.date), Autor: d.author || '', Anotação: d.content || '', Fotos: (d.photos || []).length }));
  if (diario.length) {
    const wsDi = XLSX.utils.json_to_sheet(diario);
    fitCols(wsDi, [12, 20, 60, 8]);
    XLSX.utils.book_append_sheet(wb, wsDi, 'Diário');
  }

  // --- Resumo (uma folha de rosto com os números-chave)
  const f = computeProjectFinance(project);
  const resumo = [
    { Campo: 'Obra', Valor: project.name },
    { Campo: 'Etapa atual', Valor: getStageName(project.progress, project) },
    { Campo: 'Avanço (%)', Valor: Math.round(project.progress || 0) },
    { Campo: 'Orçamento previsto', Valor: f.orcamentoObra },
    { Campo: 'Gasto até agora', Valor: f.gasto },
    { Campo: 'Aportado', Valor: f.aportadoTotal },
    { Campo: 'Saldo em caixa', Valor: f.saldoCaixa },
    { Campo: 'Unidades', Valor: (project.units || []).length },
    { Campo: 'Exportado em', Valor: new Date().toLocaleDateString('pt-BR') },
  ];
  const wsR = XLSX.utils.json_to_sheet(resumo);
  fitCols(wsR, [24, 40]);
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');
  // Resumo é a folha de rosto: joga pro início da lista de abas.
  wb.SheetNames = ['Resumo', ...wb.SheetNames.filter((n) => n !== 'Resumo')];

  return wb;
};

export const exportProjectData = (project: Project): void => {
  const wb = buildProjectWorkbook(project);
  XLSX.writeFile(wb, `ObraPro - ${safeFileName(project.name)}.xlsx`);
};
