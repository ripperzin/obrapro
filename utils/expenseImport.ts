import * as XLSX from 'xlsx';
import { Expense, ProjectMacro, ProjectItem, Investor } from '../types';

// ============================================================================
// IMPORTADOR DE PLANILHA DE DESPESAS
// Helpers puros (sem React) para ler .xlsx/.csv, mapear colunas, validar,
// casar etapa/item/sócio e detectar duplicados.
// ============================================================================

// Campos do app que uma coluna da planilha pode alimentar
export type ExpenseField = 'date' | 'description' | 'value' | 'macro' | 'item' | 'payer';

// Uma coluna da planilha mapeada para um campo do app (ou ignorada)
export type ColumnMapping = Record<number, ExpenseField | 'ignore'>;

// Linha crua lida da planilha
export interface RawRow {
  index: number;        // índice original (0-based na área de dados)
  cells: any[];         // células cruas
}

// Linha já interpretada segundo o mapeamento
export interface ParsedRow {
  index: number;
  date: string;                 // ISO yyyy-mm-dd ('' se inválida)
  description: string;
  value: number;                // 0 se inválido
  macroId?: string;             // resolvido por nome (undefined = Sem etapa)
  macroRaw?: string;            // texto original da célula de etapa
  itemId?: string;              // item da obra, resolvido por nome (undefined = Sem item)
  itemRaw?: string;             // texto original da célula de item
  paidByInvestorId?: string;
  errors: string[];             // motivos de invalidez
  isDuplicate: boolean;         // bate com despesa existente ou outra linha do arquivo
  include: boolean;             // marcado para importar
}

// ---------------------------------------------------------------------------
// Normalização de texto (case/acento-insensitive) para casar nomes
// ---------------------------------------------------------------------------
export function normalizeText(s: any): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Parse de valor monetário: aceita "1.234,56", "R$ 1.234,56", "1234.56", 1234.56
// ---------------------------------------------------------------------------
export function parseMoney(raw: any): number {
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
  let s = String(raw ?? '').trim();
  if (!s) return 0;
  // remove tudo que não é dígito, vírgula, ponto ou sinal
  s = s.replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // formato pt-BR: ponto = milhar, vírgula = decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // só vírgula → decimal
    s = s.replace(',', '.');
  }
  // só ponto (ou nenhum): já está em formato JS
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Parse de data: aceita serial do Excel, Date, "dd/mm/aaaa", "aaaa-mm-dd"
// Retorna ISO yyyy-mm-dd ou '' se não reconhecer.
// ---------------------------------------------------------------------------
export function parseDate(raw: any): string {
  if (raw == null || raw === '') return '';

  // Serial numérico do Excel (dias desde 1899-12-30)
  if (typeof raw === 'number' && isFinite(raw)) {
    const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(raw) : null;
    if (parsed && parsed.y) {
      return toIso(parsed.y, parsed.m, parsed.d);
    }
    // fallback manual
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + raw * 86400000);
    if (!isNaN(d.getTime())) return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return '';
  }

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toIso(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }

  const s = String(raw).trim();
  // dd/mm/aaaa ou dd-mm-aaaa (com ano de 2 ou 4 dígitos)
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    let year = parseInt(y, 10);
    if (year < 100) year += 2000;
    return toIso(year, parseInt(mo, 10), parseInt(d, 10));
  }
  // aaaa-mm-dd
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return toIso(parseInt(y, 10), parseInt(mo, 10), parseInt(d, 10));
  }
  return '';
}

function toIso(y: number, m: number, d: number): string {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Leitura do arquivo: retorna cabeçalho + linhas de dados da 1ª aba
// ---------------------------------------------------------------------------
export interface SheetData {
  headers: string[];   // primeira linha (rótulos das colunas)
  rows: RawRow[];      // demais linhas
}

export function readSheet(fileBuffer: ArrayBuffer): SheetData {
  const wb = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  // header:1 → matriz de arrays; defval mantém colunas vazias alinhadas
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = (matrix[0] || []).map((h) => String(h ?? '').trim());
  const rows: RawRow[] = matrix.slice(1).map((cells, i) => ({ index: i, cells }));
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Auto-detecção do mapeamento a partir dos nomes de cabeçalho
// ---------------------------------------------------------------------------
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<ExpenseField>();

  const tryAssign = (col: number, field: ExpenseField) => {
    if (!used.has(field)) {
      mapping[col] = field;
      used.add(field);
    }
  };

  headers.forEach((h, col) => {
    const n = normalizeText(h);
    if (!n) { mapping[col] = 'ignore'; return; }
    if (/(^|\b)(data|dt|vencimento|competencia|dia)\b/.test(n)) tryAssign(col, 'date');
    else if (/(valor|preco|preço|total|custo|montante|r\$|quantia|debito|débito)/.test(n)) tryAssign(col, 'value');
    else if (/(descricao|descrição|historico|histórico|produto|servico|serviço|memo|obs|detalhamento|discriminacao)/.test(n)) tryAssign(col, 'description');
    else if (/(categoria|macro|etapa|grupo|classe|classificacao)/.test(n)) tryAssign(col, 'macro');
    else if (/(item|detalhe|subcategoria|sub-categoria|submacro|subetapa|insumo|material)/.test(n)) tryAssign(col, 'item');
    else if (/(pago por|pagador|socio|sócio|responsavel|responsável|fornecedor)/.test(n)) tryAssign(col, 'payer');
    else mapping[col] = 'ignore';
  });

  // garante que toda coluna tenha entrada
  headers.forEach((_, col) => { if (!(col in mapping)) mapping[col] = 'ignore'; });
  return mapping;
}

// ---------------------------------------------------------------------------
// Casamento de categoria/detalhe/sócio por nome normalizado
// ---------------------------------------------------------------------------
function matchMacro(raw: string, macros: ProjectMacro[]): string | undefined {
  const n = normalizeText(raw);
  if (!n) return undefined;
  const exact = macros.find((m) => normalizeText(m.name) === n);
  if (exact) return exact.id;
  // fallback: contém / é contido
  const partial = macros.find((m) => {
    const mn = normalizeText(m.name);
    return mn.includes(n) || n.includes(mn);
  });
  return partial?.id;
}

// Item é GLOBAL da obra (não preso a uma etapa) → casa contra a lista toda.
function matchItem(raw: string, items: ProjectItem[]): string | undefined {
  const n = normalizeText(raw);
  if (!n) return undefined;
  const exact = items.find((it) => normalizeText(it.name) === n);
  if (exact) return exact.id;
  const partial = items.find((it) => {
    const inm = normalizeText(it.name);
    return inm.includes(n) || n.includes(inm);
  });
  return partial?.id;
}

function matchInvestor(raw: string, investors: Investor[]): string | undefined {
  const n = normalizeText(raw);
  if (!n) return undefined;
  // Casa o sócio PRIMEIRO — nomes como "Recursos próprios" (sócio auto-criado no
  // onboarding) não podem ser confundidos com "caixa" pelo termo "próprio".
  const exact = investors.find((i) => normalizeText(i.name) === n);
  if (exact) return exact.id;
  const partial = investors.find((i) => {
    const inm = normalizeText(i.name);
    return inm.includes(n) || n.includes(inm);
  });
  if (partial) return partial.id;
  // Nenhum sócio bateu → "caixa da obra"/"caixa"/"obra"/"empresa" = sai do caixa (sem sócio)
  return undefined;
}

// ---------------------------------------------------------------------------
// Chave de dedupe: data + valor (centavos) + descrição normalizada
// ---------------------------------------------------------------------------
export function dedupeKey(date: string, value: number, description: string): string {
  return `${date}|${Math.round(value * 100)}|${normalizeText(description)}`;
}

// ---------------------------------------------------------------------------
// Interpreta todas as linhas segundo o mapeamento + contexto da obra
// ---------------------------------------------------------------------------
export interface BuildContext {
  macros: ProjectMacro[];
  items: ProjectItem[];
  investors: Investor[];
  existingExpenses: Expense[];   // despesas já na obra (para dedupe)
}

export function buildParsedRows(
  rows: RawRow[],
  mapping: ColumnMapping,
  ctx: BuildContext,
): ParsedRow[] {
  // coluna → campo (inverte o mapping, ignorando 'ignore')
  const colOf: Partial<Record<ExpenseField, number>> = {};
  Object.entries(mapping).forEach(([col, field]) => {
    if (field !== 'ignore') colOf[field as ExpenseField] = Number(col);
  });

  const existingKeys = new Set(
    ctx.existingExpenses.map((e) => dedupeKey(e.date, e.value, e.description)),
  );
  const seenInFile = new Set<string>();

  const cell = (cells: any[], field: ExpenseField) => {
    const col = colOf[field];
    return col === undefined ? '' : cells[col];
  };

  return rows.map((r) => {
    const rawDate = colOf.date !== undefined ? cell(r.cells, 'date') : '';
    const rawDateStr = String(rawDate ?? '').trim();
    const date = rawDateStr ? parseDate(rawDate) : ''; // vazio é permitido (importa sem data)
    const description = String(cell(r.cells, 'description') ?? '').trim();
    const value = colOf.value !== undefined ? parseMoney(cell(r.cells, 'value')) : 0;

    const macroRaw = colOf.macro !== undefined ? String(cell(r.cells, 'macro') ?? '').trim() : '';
    const macroId = macroRaw ? matchMacro(macroRaw, ctx.macros) : undefined;
    const itemRaw = colOf.item !== undefined ? String(cell(r.cells, 'item') ?? '').trim() : '';
    const itemId = itemRaw ? matchItem(itemRaw, ctx.items) : undefined;
    const payerRaw = colOf.payer !== undefined ? String(cell(r.cells, 'payer') ?? '').trim() : '';
    const paidByInvestorId = payerRaw ? matchInvestor(payerRaw, ctx.investors) : undefined;

    const errors: string[] = [];
    // Data vazia é OK (importa sem data, edita depois). Só é erro se veio algo
    // na célula que não conseguimos interpretar como data.
    if (rawDateStr && !date) errors.push('Data em formato não reconhecido');
    if (!description) errors.push('Descrição ausente');
    if (!(value > 0)) errors.push('Valor deve ser maior que zero');

    let isDuplicate = false;
    if (errors.length === 0) {
      const key = dedupeKey(date, value, description);
      if (existingKeys.has(key) || seenInFile.has(key)) isDuplicate = true;
      seenInFile.add(key);
    }

    return {
      index: r.index,
      date,
      description,
      value,
      macroId,
      macroRaw: macroRaw || undefined,
      itemId,
      itemRaw: itemRaw || undefined,
      paidByInvestorId,
      errors,
      isDuplicate,
      // por padrão importa só linhas válidas e não-duplicadas
      include: errors.length === 0 && !isDuplicate,
    };
  });
}

// Recalcula duplicidade após edições na prévia (data/valor/descrição podem mudar)
export function recomputeDuplicates(parsed: ParsedRow[], existingExpenses: Expense[]): ParsedRow[] {
  const existingKeys = new Set(
    existingExpenses.map((e) => dedupeKey(e.date, e.value, e.description)),
  );
  const seenInFile = new Set<string>();
  return parsed.map((p) => {
    const errors: string[] = [];
    // Data vazia é permitida (importa sem data). O input de data da prévia não
    // produz lixo, então aqui não há erro de "formato".
    if (!p.description.trim()) errors.push('Descrição ausente');
    if (!(p.value > 0)) errors.push('Valor deve ser maior que zero');

    let isDuplicate = false;
    if (errors.length === 0) {
      const key = dedupeKey(p.date, p.value, p.description);
      if (existingKeys.has(key) || seenInFile.has(key)) isDuplicate = true;
      seenInFile.add(key);
    }
    return { ...p, errors, isDuplicate };
  });
}
