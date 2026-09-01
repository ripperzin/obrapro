import * as XLSX from 'xlsx';
import { labelMesAporte } from './aportePlan';
import type { AporteMatrixRow } from './aportePlan';
// `import type` de propósito: o componente importa este arquivo, então trazer o
// módulo de verdade fecharia um ciclo. Tipo some na compilação.
import type { SocioCol } from '../components/AporteScheduleSection';
import { formatDateBR, safeFileName } from './expenseExport';

// Exporta a PLANILHA DE APORTES igual ela aparece na tela: uma linha por
// parcela/aporte, uma coluna por sócio. O exportador geral (dataExport) leva só o
// resumo "Meta · Aportou · Falta"; o sócio que pediu "exporta esses lançamentos"
// quer isto aqui — parcela a parcela, com data e situação.
//
// Os valores vão como NÚMERO (não texto): o sócio abre no Excel e soma/filtra.

const rowLabel = (row: AporteMatrixRow): string => {
  if (row.kind === 'despesa') return labelMesAporte(row.ym!);
  if (row.date && row.date !== '—') return formatDateBR(row.date);
  return 'sem data';
};

const rowSituacao = (row: AporteMatrixRow): string => {
  if (row.kind === 'despesa') return `Pago em despesas (${row.qtd})`;
  if (row.kind === 'avulso') return 'Aporte avulso';
  // Linha de plano: pago se TODA célula com valor previsto já entrou.
  const cells = Object.values(row.cells);
  const pagas = cells.filter((c) => c.pago).length;
  if (!cells.length) return 'A pagar';
  if (pagas === cells.length) return 'Pago';
  return pagas > 0 ? `Pago em parte (${pagas} de ${cells.length})` : 'A pagar';
};

export const buildAporteRows = (rows: AporteMatrixRow[], socios: SocioCol[]): Record<string, any>[] => {
  // O nome do sócio vira o CABEÇALHO da coluna, então dois sócios com o mesmo nome
  // colidiriam na mesma chave e um valor sumiria dentro do outro. Desempata.
  const vistos: Record<string, number> = {};
  const colName = socios.map((s) => {
    const n = (s.name || 'Sócio').trim();
    vistos[n] = (vistos[n] || 0) + 1;
    return vistos[n] > 1 ? `${n} (${vistos[n]})` : n;
  });

  const montar = (rotulo: string, situacao: string, pick: (s: SocioCol, i: number) => number, vazioSeZero: boolean) => {
    const linha: Record<string, any> = { Data: rotulo, Situação: situacao };
    let total = 0;
    socios.forEach((s, i) => {
      const v = pick(s, i);
      linha[colName[i]] = v === 0 && vazioSeZero ? '' : v;
      total += v;
    });
    linha['Total da linha'] = total === 0 && vazioSeZero ? '' : total;
    return linha;
  };

  const linhas = rows.map((row) =>
    montar(rowLabel(row), rowSituacao(row), (s) => row.cells[s.investorId]?.value || 0, true)
  );

  // Linha em branco de verdade (separa o corpo do fecho, sem plantar zeros).
  const branco: Record<string, any> = { Data: '', Situação: '' };
  colName.forEach((n) => { branco[n] = ''; });
  branco['Total da linha'] = '';

  // Fecho igual ao rodapé da tela: aportou / meta / falta.
  return [
    ...linhas,
    branco,
    montar('APORTOU', '', (s) => s.aportado, false),
    montar('META', '', (s) => s.meta, false),
    montar('FALTA', '', (s) => Math.max(0, s.meta - s.aportado), false),
  ];
};

export const exportAportesToXlsx = (rows: AporteMatrixRow[], socios: SocioCol[], projectName: string): void => {
  const data = buildAporteRows(rows, socios);
  const ws = XLSX.utils.json_to_sheet(data);

  // Dinheiro com 2 casas e separador de milhar (o Excel guarda o número cru).
  const money = '#,##0.00';
  const nCols = 2 + socios.length + 1;
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 2; c < nCols; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'number') cell.z = money;
    }
  }
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, ...socios.map(() => ({ wch: 16 })), { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Aportes');
  XLSX.writeFile(wb, `ObraPro - Aportes - ${safeFileName(projectName)}.xlsx`);
};
