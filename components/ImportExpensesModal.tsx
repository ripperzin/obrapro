import React, { useState, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Expense, ProjectMacro, ProjectItem, Investor } from '../types';
import { formatCurrency } from '../utils';
import {
  readSheet,
  autoDetectMapping,
  buildParsedRows,
  recomputeDuplicates,
  ColumnMapping,
  ExpenseField,
  ParsedRow,
  SheetData,
} from '../utils/expenseImport';
import { usePlan } from './PlanProvider';

interface ImportExpensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (expenses: Omit<Expense, 'id' | 'userId' | 'userName'>[]) => void;
  macros: ProjectMacro[];
  items: ProjectItem[];
  investors: Investor[];
  existingExpenses: Expense[];
}

type Step = 'upload' | 'map' | 'preview';

const FIELD_LABELS: Record<ExpenseField | 'ignore', string> = {
  date: 'Data',
  description: 'Descrição',
  value: 'Valor (R$)',
  macro: 'Etapa',
  item: 'Item',
  payer: 'Pago por',
  ignore: '— ignorar —',
};

const REQUIRED: ExpenseField[] = ['date', 'description', 'value'];

const ImportExpensesModal: React.FC<ImportExpensesModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  macros,
  items,
  investors,
  existingExpenses,
}) => {
  const { ent } = usePlan();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setSheet(null);
    setMapping({});
    setRows([]);
    setError('');
    setBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const data = readSheet(buf);
      if (data.headers.length === 0 || data.rows.length === 0) {
        setError('A planilha parece vazia ou sem cabeçalho na primeira linha.');
        setBusy(false);
        return;
      }
      setFileName(file.name);
      setSheet(data);
      setMapping(autoDetectMapping(data.headers));
      setStep('map');
    } catch (e: any) {
      console.error('Erro ao ler planilha', e);
      setError('Não consegui ler este arquivo. Use .xlsx, .xls ou .csv.');
    } finally {
      setBusy(false);
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  // Campos já usados por outra coluna (para evitar mapear 2x o mesmo)
  const usedFields = useMemo(() => {
    const set = new Set<ExpenseField>();
    Object.values(mapping).forEach((f) => { if (f !== 'ignore') set.add(f as ExpenseField); });
    return set;
  }, [mapping]);

  const missingRequired = REQUIRED.filter((f) => !usedFields.has(f));

  const goToPreview = () => {
    if (!sheet) return;
    if (missingRequired.length > 0) {
      setError(`Mapeie as colunas obrigatórias: ${missingRequired.map((f) => FIELD_LABELS[f]).join(', ')}.`);
      return;
    }
    setError('');
    const parsed = buildParsedRows(sheet.rows, mapping, {
      macros,
      items,
      investors,
      existingExpenses,
    });
    setRows(parsed);
    setStep('preview');
  };

  // Edições inline na prévia
  const editRow = (index: number, patch: Partial<ParsedRow>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.index === index ? { ...r, ...patch } : r));
      return recomputeDuplicates(next, existingExpenses);
    });
  };

  const counts = useMemo(() => {
    let valid = 0, invalid = 0, dup = 0, selected = 0;
    rows.forEach((r) => {
      if (r.errors.length > 0) invalid++;
      else if (r.isDuplicate) dup++;
      else valid++;
      if (r.include && r.errors.length === 0) selected++;
    });
    return { valid, invalid, dup, selected };
  }, [rows]);

  const handleConfirm = () => {
    const toImport = rows
      .filter((r) => r.include && r.errors.length === 0)
      .map((r) => ({
        description: r.description.trim(),
        value: r.value,
        date: r.date,
        macroId: r.macroId || undefined,
        // A planilha pode ter coluna de item; no Free ela não é do plano.
        itemId: (ent.canUseItens && r.itemId) || undefined,
        paidByInvestorId: r.paidByInvestorId || undefined,
        attachments: [] as string[],
      }));
    if (toImport.length === 0) return;
    onConfirm(toImport);
    reset();
  };

  if (!isOpen) return null;
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="glass rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-700 max-h-[92vh] flex flex-col">
        {/* Cabeçalho */}
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <i className="fa-solid fa-file-import text-emerald-400"></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Importar planilha de despesas</h2>
              <p className="text-[11px] text-slate-400 font-bold">
                {step === 'upload' && 'Passo 1 de 3 — escolha o arquivo'}
                {step === 'map' && 'Passo 2 de 3 — relacione as colunas'}
                {step === 'preview' && 'Passo 3 de 3 — confira e confirme'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-sm font-bold flex items-center gap-2">
              <i className="fa-solid fa-triangle-exclamation"></i> {error}
            </div>
          )}

          {/* ===== PASSO 1: UPLOAD ===== */}
          {step === 'upload' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="w-full border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-3xl py-16 flex flex-col items-center justify-center gap-3 transition group"
              >
                <div className="w-16 h-16 rounded-2xl bg-slate-800 group-hover:bg-emerald-500/20 flex items-center justify-center transition">
                  <i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-2xl text-emerald-400`}></i>
                </div>
                <p className="font-black text-white">{busy ? 'Lendo arquivo…' : 'Clique para escolher a planilha'}</p>
                <p className="text-xs text-slate-400 font-bold">Formatos aceitos: .xlsx, .xls, .csv</p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="hidden"
                onChange={onFileInput}
              />
              <div className="text-[11px] text-slate-500 font-bold leading-relaxed px-2">
                <p className="mb-1"><i className="fa-solid fa-circle-info mr-1 text-slate-400"></i> A primeira linha deve conter os títulos das colunas.</p>
                <p>Obrigatórias: <span className="text-slate-300">Data · Descrição · Valor</span>. Opcionais: Etapa{ent.canUseItens ? ' · Item' : ''} · Pago por.</p>
              </div>
            </div>
          )}

          {/* ===== PASSO 2: MAPEAMENTO ===== */}
          {step === 'map' && sheet && (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 font-bold">
                Arquivo <span className="text-white">{fileName}</span> · {sheet.rows.length} linha(s). Confira o que cada coluna representa:
              </p>
              <div className="space-y-2">
                {sheet.headers.map((h, col) => {
                  const sample = sheet.rows.slice(0, 3).map((r) => r.cells[col]).filter((v) => v !== '' && v != null);
                  return (
                    <div key={col} className="grid grid-cols-12 gap-3 items-center bg-slate-800/60 rounded-2xl px-4 py-3 border border-slate-700">
                      <div className="col-span-6 min-w-0">
                        <p className="font-black text-white text-sm truncate">{h || <span className="text-slate-500 italic">(coluna {col + 1} sem título)</span>}</p>
                        <p className="text-[11px] text-slate-500 truncate">{sample.length ? `ex: ${sample.slice(0, 2).join(' · ')}` : 'sem exemplos'}</p>
                      </div>
                      <div className="col-span-6">
                        <select
                          value={mapping[col] ?? 'ignore'}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [col]: e.target.value as ExpenseField | 'ignore' }))}
                          className="w-full px-3 py-2 bg-slate-900 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-xs appearance-none cursor-pointer"
                        >
                          {(['ignore', 'date', 'description', 'value', 'macro', 'item', 'payer'] as const).map((f) => {
                            const takenByOther = f !== 'ignore' && usedFields.has(f) && mapping[col] !== f;
                            return (
                              <option key={f} value={f} disabled={takenByOther}>
                                {FIELD_LABELS[f]}{takenByOther ? ' (já usada)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
              {missingRequired.length > 0 && (
                <p className="text-[11px] text-amber-400 font-bold flex items-center gap-2">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  Faltam colunas obrigatórias: {missingRequired.map((f) => FIELD_LABELS[f]).join(', ')}.
                </p>
              )}
            </div>
          )}

          {/* ===== PASSO 3: PRÉVIA ===== */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Contadores */}
              <div className="grid grid-cols-4 gap-3">
                <Counter label="Válidas" value={counts.valid} tone="emerald" />
                <Counter label="Com erro" value={counts.invalid} tone="red" />
                <Counter label="Duplicadas" value={counts.dup} tone="amber" />
                <Counter label="A importar" value={counts.selected} tone="blue" />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-700">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] font-black">
                    <tr>
                      <th className="p-2 w-10"></th>
                      <th className="p-2 text-left">Data</th>
                      <th className="p-2 text-left">Descrição</th>
                      <th className="p-2 text-right">Valor</th>
                      <th className="p-2 text-left">Etapa</th>
                      {ent.canUseItens && <th className="p-2 text-left">Item</th>}
                      <th className="p-2 text-left">Pago por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const hasError = r.errors.length > 0;
                      const rowTone = hasError ? 'bg-red-500/10' : r.isDuplicate ? 'bg-amber-500/10' : '';
                      return (
                        <tr key={r.index} className={`border-t border-slate-700/60 ${rowTone}`}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={r.include && !hasError}
                              disabled={hasError}
                              onChange={(e) => editRow(r.index, { include: e.target.checked })}
                              className="w-4 h-4 accent-emerald-500 disabled:opacity-30"
                              title={hasError ? r.errors.join(' · ') : r.isDuplicate ? 'Provável duplicada — marque para importar mesmo assim' : ''}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="date"
                              value={r.date}
                              onChange={(e) => editRow(r.index, { date: e.target.value })}
                              title={!r.date ? 'Sem data — importa mesmo assim; dá pra preencher aqui ou depois na despesa' : ''}
                              className={`bg-slate-900 border rounded px-2 py-1 text-white w-32 outline-none ${!r.date ? 'border-amber-500/40' : 'border-slate-700'}`}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={r.description}
                              onChange={(e) => editRow(r.index, { description: e.target.value })}
                              className={`bg-slate-900 border rounded px-2 py-1 text-white w-full min-w-[140px] outline-none ${!r.description.trim() ? 'border-red-500' : 'border-slate-700'}`}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.01"
                              value={r.value || ''}
                              onChange={(e) => editRow(r.index, { value: parseFloat(e.target.value) || 0 })}
                              className={`bg-slate-900 border rounded px-2 py-1 text-white w-24 text-right outline-none ${!(r.value > 0) ? 'border-red-500' : 'border-slate-700'}`}
                            />
                          </td>
                          <td className="p-1">
                            <select
                              value={r.macroId || ''}
                              onChange={(e) => editRow(r.index, { macroId: e.target.value || undefined })}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white w-32 outline-none"
                            >
                              <option value="">Sem etapa</option>
                              {macros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </td>
                          {ent.canUseItens && (
                            <td className="p-1">
                              <select
                                value={r.itemId || ''}
                                onChange={(e) => editRow(r.index, { itemId: e.target.value || undefined })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white w-28 outline-none"
                              >
                                <option value="">Sem item</option>
                                {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                              </select>
                            </td>
                          )}
                          <td className="p-1">
                            <select
                              value={r.paidByInvestorId || ''}
                              onChange={(e) => editRow(r.index, { paidByInvestorId: e.target.value || undefined })}
                              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white w-28 outline-none"
                            >
                              <option value="">Caixa da obra</option>
                              {investors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 font-bold">
                <i className="fa-solid fa-circle-info mr-1"></i>
Linhas <span className="text-red-400">vermelhas</span> têm erro (corrija para importar). <span className="text-amber-400">Âmbar</span> = provável duplicada (desmarcada; marque para importar mesmo assim). Despesa <span className="text-amber-400">sem data</span> pode ser importada — preencha aqui ou depois na lista de despesas.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé / ações */}
        <div className="p-4 border-t border-slate-700 bg-slate-900/95 flex justify-between items-center gap-3">
          <button
            onClick={step === 'upload' ? handleClose : () => { setError(''); setStep(step === 'preview' ? 'map' : 'upload'); }}
            className="px-5 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 font-black text-sm hover:text-white transition"
          >
            {step === 'upload' ? 'Cancelar' : 'Voltar'}
          </button>

          {step === 'map' && (
            <button
              onClick={goToPreview}
              className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/30 flex items-center gap-2"
            >
              Ver prévia <i className="fa-solid fa-arrow-right"></i>
            </button>
          )}
          {step === 'preview' && (
            <button
              onClick={handleConfirm}
              disabled={counts.selected === 0}
              className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/30 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className="fa-solid fa-check"></i> Importar {counts.selected} despesa{counts.selected === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>,
    modalRoot,
  );
};

const Counter: React.FC<{ label: string; value: number; tone: 'emerald' | 'red' | 'amber' | 'blue' }> = ({ label, value, tone }) => {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
  };
  return (
    <div className="glass rounded-2xl border border-slate-700 px-4 py-3 text-center">
      <p className={`text-2xl font-black ${tones[tone]}`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-black uppercase">{label}</p>
    </div>
  );
};

export default ImportExpensesModal;
