import React, { useState, useMemo, useEffect, useLayoutEffect } from 'react';
import { Project, User, UserRole, ProgressStage, STAGE_NAMES, STAGE_ICONS, STAGE_ABBREV, Unit, Expense, ProjectMacro, ProjectItem, TemplateStageItem, getProjectStages, getStageName, getStageIndex } from '../types';
import { useInflation } from '../hooks/useInflation';
import { PROGRESS_STAGES } from '../constants';
import { formatCurrency, formatCurrencyAbbrev, generateId, calculateMonthsBetween } from '../utils';
import { openAttachment } from '../utils/storage';
import MoneyInput from './MoneyInput';
import ShareReportModal from './ShareReportModal';
import DateInput from './DateInput';
import ConfirmModal from './ConfirmModal';
import AttachmentUpload from './AttachmentUpload';
import DocumentsSection from './DocumentsSection';
import DiarySection from './DiarySection';
import StageEvidenceModal from './StageEvidenceModal';
import StageThumbnail from './StageThumbnail';
import BudgetSection from './BudgetSection';
import AddUnitModal from './AddUnitModal';
import AddExpenseModal from './AddExpenseModal';
import ImportExpensesModal from './ImportExpensesModal';
import ManageAttachmentsModal from './ManageAttachmentsModal';
import ScheduleView from './ScheduleView';
import CashSummaryCards from './CashSummaryCards';
import RecentMovements from './RecentMovements';
import AquisicaoSection from './AquisicaoSection';
import ResultadoEmpreendimento from './ResultadoEmpreendimento';
import SociosSection from './SociosSection';
import { computeProjectFinance, computeGastoAvancoVerdito } from '../utils/projectFinance';
import { usePlan } from './PlanProvider';

import { supabase } from '../supabaseClient';

// Abas da obra (cada seção na sua própria aba, como o Victor prefere):
// Gestão · Sócios · Despesas · Unidades · Orçamento · Docs · Diário
type ObraTab = 'info' | 'units' | 'expenses' | 'socios' | 'budget' | 'documents' | 'diary';

interface ProjectDetailProps {
  project: Project;
  user: User;
  onUpdate: (id: string, updates: Partial<Project>, logMsg?: string) => Promise<void>;
  onDeleteUnit: (projectId: string, unitId: string) => void;
  onDeleteExpense: (projectId: string, expenseId: string) => void;
  onRefresh?: () => Promise<void>;
  onUpdateDiary?: (projectId: string, entry: any) => Promise<void>;
  onDeleteDiary?: (projectId: string, entryId: string) => Promise<void>;
  onDeleteDocument?: (projectId: string, documentId: string) => void;
}

const UnitsSection: React.FC<{
  project: Project,
  user: User,
  onAddUnit: (u: any) => Promise<void>,
  onUpdateUnit: (id: string, updates: Partial<Unit>) => void,
  onDeleteUnit: (projectId: string, unitId: string) => void,
  onUpdate: (id: string, updates: Partial<Project>, logMsg?: string) => Promise<void>,
  logChange: (a: string, f: string, o: string, n: string) => void
}> = ({ project, user, onAddUnit, onUpdateUnit, onDeleteUnit, onUpdate, logChange }) => {
  // Sync showAdd with URL action parameter
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new-unit' && !showAdd) {
      setShowAdd(true);
    }
  }, []);

  const handleSetShowAdd = (value: boolean) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set('action', 'new-unit');
    } else {
      params.delete('action');
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    setShowAdd(value);
  };
  const [isSaving, setIsSaving] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    identifier: '',
    area: 0,
    cost: 0,
    valorEstimadoVenda: 0,
    status: 'Available' as 'Available' | 'Sold'
  });
  const [unitToDelete, setUnitToDelete] = useState<string | null>(null);

  // Sync editingUnitId and unitToDelete with URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const unitId = params.get('unitId');

    if (action === 'edit-unit' && unitId && unitId !== editingUnitId) {
      setEditingUnitId(unitId);
      // Expand the unit being edited automatically
      setExpandedUnitIds(prev => new Set(prev).add(unitId));
    }
    if (action === 'delete-unit' && unitId && unitId !== unitToDelete) {
      setUnitToDelete(unitId);
    }
  }, []);

  const handleSetEditingUnitId = (id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('action', 'edit-unit');
      params.set('unitId', id);
    } else {
      if (params.get('action') === 'edit-unit') {
        params.delete('action');
        params.delete('unitId');
      }
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    setEditingUnitId(id);
  };

  const handleSetUnitToDelete = (id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('action', 'delete-unit');
      params.set('unitId', id);
    } else {
      if (params.get('action') === 'delete-unit') {
        params.delete('action');
        params.delete('unitId');
      }
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    setUnitToDelete(id);
  };
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(new Set());

  // Sync expanded units with URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const expanded = params.get('expandedUnits');
    if (expanded) {
      setExpandedUnitIds(new Set(expanded.split(',')));
    }
  }, []);

  const toggleExpansion = (id: string) => {
    const newSet = new Set(expandedUnitIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedUnitIds(newSet);

    const params = new URLSearchParams(window.location.search);
    if (newSet.size > 0) {
      params.set('expandedUnits', Array.from(newSet).join(','));
    } else {
      params.delete('expandedUnits');
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };
  const { inflationRate } = useInflation();

  const isAdmin = user.role === UserRole.ADMIN;
  const isCompleted = project.progress === ProgressStage.COMPLETED;
  // Números do portfólio (mesma fonte do Resultado do Empreendimento).
  const unitsFin = computeProjectFinance(project);

  const firstExpenseDate = project.expenses.length > 0
    ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date)
    : null;

  const handleUpdateUnit = (unitId: string, updates: Partial<Unit>) => {
    onUpdateUnit(unitId, updates);
  };

  const handleSubmitNewUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    console.log('=== DEBUG: Formulário enviado ===');
    console.log('FormData:', formData);

    try {
      await onAddUnit(formData);
      console.log('=== DEBUG: Unidade adicionada com sucesso ===');
      handleSetShowAdd(false);
      setFormData({
        identifier: '',
        area: 0,
        cost: 0,
        valorEstimadoVenda: 0,
        status: 'Available'
      });
    } catch (error) {
      console.error('=== DEBUG: Erro ao adicionar unidade ===', error);
    } finally {
      setIsSaving(false);
    }
  };

  // --- Custo de referência por m² (recalcular custo das casas em lote) ---
  const [refCustoM2, setRefCustoM2] = useState<number>(0);
  const [isRecalc, setIsRecalc] = useState(false);
  const [showRecalc, setShowRecalc] = useState(false);

  const totalUnitsAreaAll = project.units.reduce((s, u) => s + (u.area || 0), 0);
  const totalUnitsCostAll = project.units.reduce((s, u) => s + (u.cost || 0), 0);
  // R$/m² atual: o guardado na obra; se não houver, a média derivada dos custos das casas
  const custoM2Atual = project.custoM2 && project.custoM2 > 0
    ? project.custoM2
    : (totalUnitsAreaAll > 0 ? totalUnitsCostAll / totalUnitsAreaAll : 0);

  useEffect(() => {
    setRefCustoM2(Math.round(custoM2Atual * 100) / 100);
  }, [custoM2Atual]);

  const handleRecalcCosts = async () => {
    const afetadas = project.units.filter(u => (u.area || 0) > 0).length;
    if (!refCustoM2 || refCustoM2 <= 0 || afetadas === 0) return;
    const ok = window.confirm(
      `Recalcular o custo estimado de ${afetadas} casa(s) usando ${formatCurrency(refCustoM2)}/m²?\n\n` +
      `O custo de cada casa vira (área × R$/m²). Ajustes manuais de custo por casa serão substituídos.`
    );
    if (!ok) return;
    setIsRecalc(true);
    try {
      const novasUnits = project.units.map(u => ({
        ...u,
        cost: Math.round((u.area || 0) * refCustoM2 * 100) / 100,
      }));
      const expectedTotalCost = novasUnits.reduce((s, u) => s + (u.cost || 0), 0);
      const expectedTotalSales = novasUnits.reduce((s, u) => s + (u.saleValue || u.valorEstimadoVenda || 0), 0);
      await onUpdate(project.id, { custoM2: refCustoM2, units: novasUnits, expectedTotalCost, expectedTotalSales }, `Recálculo de custos: ${formatCurrency(refCustoM2)}/m²`);
    } finally {
      setIsRecalc(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="font-black text-white text-xl uppercase tracking-tight flex items-center gap-3">
          <i className="fa-solid fa-house-user text-blue-400"></i>
          Portfólio de Unidades
        </h3>
        {isAdmin && (
          <button onClick={() => handleSetShowAdd(true)} className="bg-blue-600 text-white px-6 py-3 rounded-full font-black text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 flex items-center gap-2">
            <i className="fa-solid fa-plus"></i> Nova Unidade
          </button>
        )}
      </div>

      {/* Resumo do portfólio: vendidas + lucro projetado × real (mesma fonte do Resultado) */}
      {project.units.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Resumo</p>
            {isAdmin && (
              <button
                onClick={() => setShowRecalc(v => !v)}
                title="Custo de referência por m² (recalcula o custo de todas as casas)"
                className={`px-3 py-1.5 rounded-full font-black text-[11px] transition flex items-center gap-2 border ${showRecalc ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
              >
                <i className="fa-solid fa-ruler-combined"></i>
                <span>Custo/m²</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="glass rounded-xl border border-slate-700 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">Vendidas</p>
              <p className="text-white font-black text-base md:text-lg">{unitsFin.unidadesVendidas}/{unitsFin.unidadesTotais}</p>
            </div>
            <div className="glass rounded-xl border border-slate-700 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400 truncate">Lucro projetado</p>
              <p className={`font-black text-base md:text-lg whitespace-nowrap ${unitsFin.vendasEstimadasTotais > 0 ? (unitsFin.lucroProjetado >= 0 ? 'text-cyan-400' : 'text-rose-400') : 'text-slate-500'}`}>
                {unitsFin.vendasEstimadasTotais > 0 ? formatCurrencyAbbrev(unitsFin.lucroProjetado) : '—'}
              </p>
            </div>
            <div className="glass rounded-xl border border-slate-700 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 truncate">Lucro real</p>
              {isCompleted ? (
                <p className={`font-black text-base md:text-lg whitespace-nowrap ${unitsFin.lucroReal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrencyAbbrev(unitsFin.lucroReal)}</p>
              ) : (
                <p className="text-slate-500 font-black text-base md:text-lg" title="Disponível ao concluir a obra"><i className="fa-solid fa-lock text-sm"></i></p>
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && showRecalc && project.units.length > 0 && (
        <div className="glass rounded-2xl border border-emerald-500/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-in">
          <div className="flex items-center gap-2 text-slate-400 shrink-0">
            <i className="fa-solid fa-ruler-combined text-emerald-400"></i>
            <span className="text-[10px] font-black uppercase tracking-widest">Custo de referência</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <MoneyInput
              value={refCustoM2}
              onChange={setRefCustoM2}
              className="w-36 px-4 py-2.5 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl outline-none font-bold text-white text-sm"
            />
            <span className="text-slate-500 text-xs font-bold">/m²</span>
          </div>
          <button
            onClick={handleRecalcCosts}
            disabled={isRecalc || !refCustoM2}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
            title="Substitui o custo estimado de cada casa por área × R$/m²"
          >
            {isRecalc ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-calculator"></i>}
            Recalcular custos das casas
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={!!unitToDelete}
        onClose={() => handleSetUnitToDelete(null)}
        onConfirm={() => {
          if (unitToDelete) {
            onDeleteUnit(project.id, unitToDelete);
            handleSetUnitToDelete(null);
          }
        }}
        title="Excluir Unidade?"
        message="Tem certeza que deseja excluir esta unidade? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      {/* Modal Nova Unidade */}
      <AddUnitModal
        isOpen={showAdd}
        onClose={() => handleSetShowAdd(false)}
        onSave={async (unit) => {
          await onAddUnit(unit);
          handleSetShowAdd(false);
        }}
      />

      {/* Grid de Cards de Unidades - Dark Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {project.units.map(unit => {
          const isCompleted = project.progress === 100;
          const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);
          const terrenoTotal = (project.acquisitionCosts || []).reduce((sum, a) => sum + (a.value || 0), 0);

          // Área total REAL (soma das unidades) para ratear o custo por m² entre as casas
          const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);
          const areaShare = totalUnitsArea > 0 ? unit.area / totalUnitsArea : 0;

          // Cada casa carrega a fatia da sua área na obra E no terreno (empreendimento completo)
          const terrenoRateio = areaShare * terrenoTotal;
          const custoObraRealizado = areaShare * totalExpenses;
          // Custo realizado da casa = obra realizada (rateada) + terreno rateado. "Até agora" enquanto a obra corre; final ao concluir.
          const custoRealizado = custoObraRealizado + terrenoRateio;
          // Custo total estimado da casa = obra orçada + terreno rateado
          const custoEstimadoTotal = unit.cost + terrenoRateio;

          const perM2 = (v: number) => (unit.area > 0 ? v / unit.area : 0);
          const isEditing = editingUnitId === unit.id;

          // PROJETADO: venda estimada (ou a de venda, se não houver estimativa) − custo obra orçado − terreno.
          const vendaProj = (unit.valorEstimadoVenda && unit.valorEstimadoVenda > 0) ? unit.valorEstimadoVenda : (unit.saleValue || 0);
          const temProjecao = vendaProj > 0;
          const lucroProj = vendaProj - custoEstimadoTotal; // custoEstimadoTotal = unit.cost + terrenoRateio
          const margemProj = temProjecao ? (lucroProj / vendaProj) * 100 : 0;

          // REAL: só quando vendida. Lucro real fica TRAVADO até a obra concluir.
          const vendido = (unit.saleValue || 0) > 0;
          const lucroRealCasa = (unit.saleValue || 0) - custoRealizado; // custoRealizado = obra rateada + terreno
          const margemRealCasa = vendido ? (lucroRealCasa / (unit.saleValue || 1)) * 100 : 0;

          return (
            <div
              key={unit.id}
              className={`glass rounded-2xl border transition-all ${isEditing ? 'border-orange-500' : 'border-slate-700 hover:border-blue-500/50'} ${expandedUnitIds.has(unit.id) ? 'p-6 shadow-xl md:col-span-2 lg:col-span-3' : 'p-4 cursor-pointer hover:bg-slate-800/30'}`}
              onClick={() => {
                if (!expandedUnitIds.has(unit.id)) {
                  toggleExpansion(unit.id);
                }
              }}
            >
              {/* Header */}
              <div className={`flex justify-between items-center ${expandedUnitIds.has(unit.id) ? 'mb-6 items-start' : ''}`}>
                <div className={`flex-1 ${!expandedUnitIds.has(unit.id) ? 'flex items-center gap-4' : ''}`}>
                  <div className="flex items-center gap-3">
                    <h5 className="font-black text-white text-lg">{unit.identifier}</h5>
                    <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${unit.status === 'Sold' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                      {unit.status === 'Sold' ? 'Vendida' : 'À Venda'}
                    </div>
                  </div>
                  <p className={`text-[10px] text-slate-500 font-bold uppercase ${!expandedUnitIds.has(unit.id) ? 'ml-2' : 'mt-1'}`}>
                    {unit.area} m² <span className="hidden md:inline">de área</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {expandedUnitIds.has(unit.id) ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpansion(unit.id); }}
                        className="w-9 h-9 flex items-center justify-center bg-slate-800/50 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition"
                        title="Recolher"
                      >
                        <i className="fa-solid fa-chevron-up"></i>
                      </button>

                      {isEditing ? (
                        <button
                          onClick={() => handleSetEditingUnitId(null)}
                          className="w-9 h-9 flex items-center justify-center bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500 hover:text-white transition"
                          title="Confirmar"
                        >
                          <i className="fa-solid fa-check"></i>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSetEditingUnitId(unit.id); }}
                            className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition border border-slate-700"
                            title="Editar"
                          >
                            <i className="fa-solid fa-pen-to-square text-sm"></i>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSetUnitToDelete(unit.id); }}
                            className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-red-600 hover:text-white transition border border-slate-700"
                            title="Excluir"
                          >
                            <i className="fa-solid fa-trash text-sm"></i>
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-9 h-9 flex items-center justify-center text-slate-500 opacity-50">
                      <i className="fa-solid fa-chevron-down"></i>
                    </div>
                  )}
                </div>
              </div>

              {/* Conteúdo Expandido — Projetado | Real (mesmo padrão do Resultado) */}
              {expandedUnitIds.has(unit.id) && (
                <div className="animate-fade-in grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {/* DONO DA UNIDADE (divisão por unidade) */}
                  {(isEditing || unit.ownerInvestorId) && (
                    <div className="sm:col-span-2 flex items-center justify-between gap-2 bg-slate-800/40 rounded-xl border border-slate-700/60 px-4 py-2.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400">
                        <i className="fa-solid fa-user-tag mr-1"></i> Dono da unidade
                      </span>
                      {isEditing ? (
                        <select
                          value={unit.ownerInvestorId || ''}
                          onChange={(e) => handleUpdateUnit(unit.id, { ownerInvestorId: e.target.value || undefined })}
                          className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs font-bold text-white outline-none focus:border-fuchsia-500"
                        >
                          <option value="">Sem dono</option>
                          {(project.investors || []).map((inv) => (
                            <option key={inv.id} value={inv.id}>{inv.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm font-bold text-white">
                          {(project.investors || []).find((i) => i.id === unit.ownerInvestorId)?.name || 'Sem dono'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* PROJETADO */}
                  <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-3">
                      <i className="fa-solid fa-chart-line mr-1"></i> Projetado
                    </p>
                    {(temProjecao || isEditing) ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Venda estimada</span>
                          {isEditing ? (
                            <MoneyInput
                              className="w-28 bg-slate-700 p-1.5 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-cyan-500"
                              value={unit.valorEstimadoVenda || 0}
                              onBlur={(val) => handleUpdateUnit(unit.id, { valorEstimadoVenda: val })}
                            />
                          ) : (
                            <span className="text-white font-bold">{formatCurrency(vendaProj)}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">− Custo obra <span className="text-slate-600 text-xs">(orçado)</span></span>
                          {isEditing ? (
                            <MoneyInput
                              className="w-28 bg-slate-700 p-1.5 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-cyan-500"
                              value={unit.cost}
                              onBlur={(val) => handleUpdateUnit(unit.id, { cost: val })}
                            />
                          ) : (
                            <span className="text-slate-300">{formatCurrency(unit.cost)}</span>
                          )}
                        </div>
                        {terrenoTotal > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">− Terreno <span className="text-slate-600 text-xs">(rateio)</span></span>
                            <span className="text-slate-300">{formatCurrency(terrenoRateio)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-baseline border-t border-slate-700/60 pt-2 mt-1">
                          <span className="text-white font-black uppercase text-[10px] tracking-widest">Lucro projetado</span>
                          <span className={`font-black text-lg ${!temProjecao ? 'text-slate-500' : lucroProj >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                            {temProjecao ? formatCurrency(lucroProj) : '—'}
                          </span>
                        </div>
                        {temProjecao && (
                          <p className="text-right text-[11px] text-slate-500">
                            margem {margemProj.toFixed(1)}%{unit.area > 0 ? ` · ${formatCurrency(perM2(lucroProj))}/m²` : ''}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <i className="fa-solid fa-chart-line text-slate-600 text-xl mb-2"></i>
                        <p className="text-slate-500 text-xs font-bold">Sem projeção ainda</p>
                        <p className="text-slate-600 text-[11px] mt-1 leading-snug">Edite e informe a venda estimada para ver o lucro projetado.</p>
                      </div>
                    )}
                  </div>

                  {/* REAL */}
                  <div className="bg-slate-800/40 rounded-xl border border-slate-700/60 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3">
                      <i className="fa-solid fa-circle-check mr-1"></i> Real <span className="text-slate-500 normal-case font-medium">(venda)</span>
                    </p>
                    {(vendido || isEditing) ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Vendido por</span>
                          {isEditing ? (
                            <MoneyInput
                              className="w-28 bg-slate-700 p-1.5 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-emerald-500"
                              value={unit.saleValue || 0}
                              onBlur={(val) => handleUpdateUnit(unit.id, { saleValue: val === 0 ? undefined : val })}
                            />
                          ) : (
                            <span className="text-white font-bold">{formatCurrency(unit.saleValue || 0)}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Data</span>
                          {isEditing ? (
                            <DateInput
                              className="w-32 bg-slate-700 p-1.5 border border-slate-600 rounded-lg text-right font-bold text-white text-xs outline-none focus:border-emerald-500"
                              value={unit.saleDate}
                              onBlur={(val) => handleUpdateUnit(unit.id, { saleDate: val === "" ? undefined : val })}
                            />
                          ) : (
                            <span className="text-slate-300">{unit.saleDate ? new Date(unit.saleDate + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                          )}
                        </div>
                        {isCompleted ? (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-400">− Custo real</span>
                              <span className="text-slate-300">{formatCurrency(custoRealizado)}</span>
                            </div>
                            <div className="flex justify-between items-baseline border-t border-slate-700/60 pt-2 mt-1">
                              <span className="text-white font-black uppercase text-[10px] tracking-widest">Lucro real</span>
                              <span className={`font-black text-lg ${lucroRealCasa >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {vendido ? formatCurrency(lucroRealCasa) : '—'}
                              </span>
                            </div>
                            {vendido && (
                              <p className="text-right text-[11px] text-slate-500">margem {margemRealCasa.toFixed(1)}%</p>
                            )}
                          </>
                        ) : (
                          <div className="border-t border-slate-700/60 pt-3 mt-1 flex items-center gap-2 text-slate-500">
                            <i className="fa-solid fa-lock"></i>
                            <p className="text-[11px] font-bold leading-snug">Lucro real disponível ao concluir a obra</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <i className="fa-solid fa-tag text-slate-600 text-xl mb-2"></i>
                        <p className="text-slate-500 text-xs font-bold">Casa ainda não vendida</p>
                        <p className="text-slate-600 text-[11px] mt-1 leading-snug">Edite para registrar a venda.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
const ExpensesSection: React.FC<{
  project: Project,
  user: User,
  onAddExpense: (e: any) => void,
  onUpdate: (e: Expense[]) => void,
  logChange: (a: string, f: string, o: string, n: string) => void,
  onDeleteExpense: (id: string) => void,
  initialAction?: string | null
}> = ({ project, user, onAddExpense, onUpdate, logChange, onDeleteExpense, initialAction }) => {
  const [showAdd, setShowAdd] = useState(initialAction === 'new-expense');
  const [showImport, setShowImport] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    value: 0,
    date: new Date().toISOString().split('T')[0],
    attachmentUrl: undefined as string | undefined,
    macroId: undefined as string | undefined,
    subMacroId: undefined as string | undefined
  });
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [projectMacros, setProjectMacros] = useState<ProjectMacro[]>([]);
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [stageItems, setStageItems] = useState<TemplateStageItem[]>([]);
  const [budgetRefreshKey, setBudgetRefreshKey] = useState(0);
  const [itemsRefreshKey, setItemsRefreshKey] = useState(0);
  const [attachmentManagerId, setAttachmentManagerId] = useState<string | null>(null);
  const [tempDescription, setTempDescription] = useState('');
  const { ent, openUpgrade } = usePlan();

  // Sync showAdd with URL action parameter for persistence across re-renders
  useEffect(() => {
    // Check URL on every render to restore modal state
    const params = new URLSearchParams(window.location.search);
    const urlAction = params.get('action');
    if (urlAction === 'new-expense' && !showAdd) {
      setShowAdd(true);
    }
  }, [initialAction]); // Re-check when initialAction prop changes

  // Custom setter that syncs to URL
  const handleSetShowAdd = (value: boolean) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set('action', 'new-expense');
    } else {
      params.delete('action');
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    setShowAdd(value);
  };

  // Ordenar despesas: Mais recentes primeiro (Ordem Cronológica Inversa)
  // O usuário pediu "cronológica", mas em finanças geralmente isso significa ver o mais recente no topo.
  // Se quiserem o inverso (1..N), basta inverter a subtração.
  const sortedExpenses = useMemo(() => {
    return [...project.expenses].sort((a, b) => {
      // Ordena por data (decrescente)
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      // Se data igual, ordena por nome
      return a.description.localeCompare(b.description);
    });
  }, [project.expenses]);

  // Nome do sócio que pagou a despesa do próprio bolso (se houver)
  const payerName = (investorId?: string): string | null => {
    if (!investorId) return null;
    const inv = (project.investors || []).find((i) => i.id === investorId);
    return inv ? inv.name : null;
  };

  // Buscar macros do projeto
  useEffect(() => {
    const fetchMacros = async () => {
      try {
        // Buscar budget do projeto
        const { data: budgetData } = await supabase
          .from('project_budgets')
          .select('id')
          .eq('project_id', project.id)
          .single();

        if (budgetData) {
          const { data: macrosData } = await supabase
            .from('project_macros')
            .select('*')
            .eq('budget_id', budgetData.id)
            .order('display_order');

          if (macrosData) {
            setProjectMacros(macrosData.map(m => ({
              id: m.id,
              budgetId: m.budget_id,
              name: m.name,
              percentage: m.percentage,
              estimatedValue: m.estimated_value,
              spentValue: m.spent_value || 0,
              displayOrder: m.display_order
            })));
          }
        }
      } catch (error) {
        console.error('Erro ao buscar macros:', error);
      }
    };
    fetchMacros();
  }, [project.id, budgetRefreshKey]);

  // Itens da obra (lista plana) + preset item↔etapa (sugestões por etapa).
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data: itemsData } = await supabase
          .from('project_items')
          .select('id, name, display_order')
          .eq('project_id', project.id)
          .order('display_order');
        if (itemsData) {
          setProjectItems(itemsData.map(it => ({
            id: it.id,
            projectId: project.id,
            name: it.name,
            displayOrder: it.display_order
          })));
        }
        // Preset do template padrão: quais itens são típicos de cada etapa.
        const { data: stageData } = await supabase
          .from('template_stage_items')
          .select('macro_name, item_name, percentage, optional, display_order')
          .eq('template_id', '00000000-0000-0000-0000-000000000001')
          .order('display_order');
        if (stageData) {
          setStageItems(stageData.map(s => ({
            macroName: s.macro_name,
            itemName: s.item_name,
            percentage: s.percentage,
            optional: s.optional,
            displayOrder: s.display_order
          })));
        }
      } catch (error) {
        console.error('Erro ao buscar itens da obra:', error);
      }
    };
    fetchItems();
  }, [project.id, itemsRefreshKey]);

  const isAdmin = user.role === UserRole.ADMIN;

  // Cria um ITEM na obra (lista plana global) ao lançar despesa, sem sair do modal.
  // Dedupe por nome (ignora maiúsculas/acentos) — reaproveita o existente se já houver.
  const handleCreateItem = async (name: string): Promise<string | null> => {
    const clean = name.trim();
    if (!clean) return null;
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const existing = projectItems.find(it => norm(it.name) === norm(clean));
    if (existing) return existing.id;
    try {
      const order = projectItems.reduce((max, it) => Math.max(max, it.displayOrder), 0) + 1;
      const { data, error } = await supabase
        .from('project_items')
        .insert({ project_id: project.id, name: clean, display_order: order })
        .select('id')
        .single();
      if (error || !data) throw error || new Error('sem retorno');
      setItemsRefreshKey(k => k + 1); // recarrega a lista pro item novo aparecer
      return data.id;
    } catch (err) {
      console.error('Erro ao criar item:', err);
      alert('Erro ao criar item. Tente novamente.');
      return null;
    }
  };

  const handleEditExpense = (expId: string, updates: Partial<Expense>) => {
    if (!isAdmin) return;
    const oldExp = project.expenses.find(e => e.id === expId)!;
    const updatedExpenses = project.expenses.map(e => e.id === expId ? { ...e, ...updates } : e);

    onUpdate(updatedExpenses);

    // Log individual changes
    Object.keys(updates).forEach(key => {
      const field = key as keyof Expense;
      if (field !== 'macroId' && field !== 'subMacroId' && field !== 'itemId' && field !== 'attachments') {
        logChange('Alteração', `Despesa ${oldExp.description} - ${field}`, String(oldExp[field] || ''), String(updates[field]));
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="font-black text-white text-lg uppercase tracking-tight flex items-center gap-3">
          <i className="fa-solid fa-wallet text-green-400"></i>
          Fluxo de Despesas
        </h3>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)} className="bg-slate-800 border border-slate-700 text-slate-200 px-4 py-3 rounded-full font-black text-sm hover:border-emerald-500 hover:text-white transition flex items-center gap-2">
              <i className="fa-solid fa-file-import text-emerald-400"></i> <span className="hidden sm:inline">Importar planilha</span>
            </button>
            <button onClick={() => handleSetShowAdd(true)} className="bg-green-600 text-white px-6 py-3 rounded-full font-black text-sm hover:bg-green-700 transition shadow-lg shadow-green-600/30 flex items-center gap-2">
              <i className="fa-solid fa-plus"></i> Nova Despesa
            </button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={() => {
          if (expenseToDelete) {
            onDeleteExpense(expenseToDelete);
            setExpenseToDelete(null);
          }
        }}
        title="Excluir Despesa?"
        message="Tem certeza que deseja remover esta despesa do fluxo de caixa? Isso afetará os cálculos financeiros da obra."
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-6 rounded-2xl border border-slate-700">
          <p className="text-[10px] text-slate-500 font-black uppercase mb-1">Total Desembolsado</p>
          <p className="text-3xl font-black text-white">{formatCurrency(project.expenses.reduce((a, b) => a + b.value, 0))}</p>
        </div>
        <div className="glass p-6 rounded-2xl border border-slate-700">
          <p className="text-[10px] text-blue-400 font-black uppercase mb-1">Volume de Lançamentos</p>
          <p className="text-3xl font-black text-blue-400">
            {project.expenses.length} <span className="text-xs opacity-40 uppercase ml-1">Notas</span>
          </p>
        </div>
      </div>

      {/* Modal Nova Despesa */}
      <AddExpenseModal
        isOpen={showAdd}
        onClose={() => handleSetShowAdd(false)}
        onSave={(exp) => {
          onAddExpense(exp);
          handleSetShowAdd(false);
        }}
        macros={projectMacros}
        items={projectItems}
        stageItems={stageItems}
        investors={project.investors || []}
        defaultPayerId={project.financedByInvestorId}
        onCreateItem={handleCreateItem}
      />

      {/* Modal Importar Planilha */}
      <ImportExpensesModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        macros={projectMacros}
        items={projectItems}
        investors={project.investors || []}
        existingExpenses={project.expenses}
        onConfirm={(imported) => {
          const newExpenses: Expense[] = imported.map((e) => ({
            ...e,
            id: generateId(),
            userId: user.id,
            userName: user.login,
          }));
          onUpdate([...project.expenses, ...newExpenses]);
          logChange('Importação', 'Despesas via planilha', '-', `${newExpenses.length} lançamento(s)`);
          setShowImport(false);
        }}
      />

      {/* Modal Gerenciar Anexos */}
      {attachmentManagerId && (
        <ManageAttachmentsModal
          isOpen={true}
          onClose={() => setAttachmentManagerId(null)}
          attachments={(() => {
            const exp = project.expenses.find(e => e.id === attachmentManagerId);
            if (!exp) return [];
            return (exp.attachments && exp.attachments.length > 0) ? exp.attachments : (exp.attachmentUrl ? [exp.attachmentUrl] : []);
          })()}
          onSave={(newAttachments) => {
            if (attachmentManagerId) {
              // ATOMIC UPDATE: Send both fields in a single call to avoid race conditions
              handleEditExpense(attachmentManagerId, {
                attachments: newAttachments,
                attachmentUrl: newAttachments.length > 0 ? newAttachments[0] : null as any
              });
            }
          }}
        />
      )}

      {/* Lista de Despesas - Responsive */}
      <div className="space-y-4">
        {/* Mobile: Lista de Cards */}
        <div className="md:hidden space-y-3">
          {sortedExpenses.map((exp) => {
            const isEditing = editingExpenseId === exp.id;
            return (
              <div key={exp.id} className={`glass rounded-2xl p-6 border transition-all ${isEditing ? 'border-orange-500' : 'border-slate-700'}`}>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1">
                    <div className="mb-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Descrição</span>
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            onFocus={(e) => e.target.select()}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-bold text-white w-full outline-none"
                            value={tempDescription}
                            onChange={(e) => setTempDescription(e.target.value)}
                            onBlur={() => handleEditExpense(exp.id, { description: tempDescription })}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                          {(project.investors || []).length > 0 && (
                            <select
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs font-bold text-amber-300 w-full outline-none"
                              value={exp.paidByInvestorId || ''}
                              onChange={(e) => handleEditExpense(exp.id, { paidByInvestorId: e.target.value || undefined })}
                            >
                              <option value="">Pago pelo caixa</option>
                              {(project.investors || []).map((i) => (
                                <option key={i.id} value={i.id}>Pago por {i.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <h5 className="font-black text-white text-lg">{exp.description}</h5>
                      )}
                      {payerName(exp.paidByInvestorId) && (
                        <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                          <i className="fa-solid fa-hand-holding-dollar"></i> {payerName(exp.paidByInvestorId)}
                        </span>
                      )}
                      {/* Selo Etapa · Item (mobile, só leitura) */}
                      {!isEditing && (exp.macroId || exp.itemId) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {projectMacros.find(m => m.id === exp.macroId) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[10px] font-bold">
                              <i className="fa-solid fa-layer-group text-[8px]"></i>
                              {projectMacros.find(m => m.id === exp.macroId)?.name}
                            </span>
                          )}
                          {ent.canUseItens && projectItems.find(it => it.id === exp.itemId) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 text-[10px] font-bold">
                              <i className="fa-solid fa-box text-[8px]"></i>
                              {projectItems.find(it => it.id === exp.itemId)?.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 ml-4">
                      {isEditing ? (
                        <button onClick={() => setEditingExpenseId(null)} className="w-9 h-9 flex items-center justify-center bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500 hover:text-white transition">
                          <i className="fa-solid fa-check"></i>
                        </button>
                      ) : (
                        <>
                          <button onClick={() => {
                            setEditingExpenseId(exp.id);
                            setTempDescription(exp.description);
                          }} className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition border border-slate-700">
                            <i className="fa-solid fa-pen-to-square text-sm"></i>
                          </button>
                          <button onClick={() => setExpenseToDelete(exp.id)} className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-red-600 hover:text-white transition border border-slate-700">
                            <i className="fa-solid fa-trash text-sm"></i>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Data</div>
                    {isEditing ? (
                      <DateInput
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-2 text-sm font-bold text-white w-full text-center outline-none"
                        value={exp.date}
                        onBlur={(val) => handleEditExpense(exp.id, { date: val })}
                      />
                    ) : (
                      <div className="text-sm font-bold text-slate-300">
                        {(() => {
                          if (!exp.date) return <span className="text-amber-400/80 italic">Sem data</span>;
                          const [y, m, d] = exp.date.split('-');
                          return `${d}/${m}/${y}`;
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Valor</div>
                    {isEditing ? (
                      <MoneyInput
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-2 text-sm font-bold text-white text-right w-full outline-none"
                        value={exp.value}
                        onBlur={(val) => handleEditExpense(exp.id, { value: val })}
                      />
                    ) : (
                      <div className="text-lg font-black text-green-400">{formatCurrency(exp.value)}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-400 border border-slate-600">
                      {(exp.userName && exp.userName[0]) ? exp.userName[0].toUpperCase() : '-'}
                    </div>
                    <div className="text-xs text-slate-400 font-bold">{exp.userName || 'Sistema'}</div>
                  </div>
                  {/* Botão de Anexos - Mobile */}
                  {(exp.attachmentUrl || (exp.attachments && exp.attachments.length > 0) || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => isAdmin ? setAttachmentManagerId(exp.id) : (exp.attachmentUrl ? openAttachment(exp.attachmentUrl) : null)} // Se não for admin, mantém view simples ou abre manager readonly? Por simplicidade, admin gerencia. User vê.
                      // Melhor: Se for admin, abre manager. Se user comum, abre o primeiro. (Melhorar depois para user comum ver todos)
                      // Ajuste: Se user comum, abrir manager em modo visualização (posso adicionar prop readOnly no modal depois).
                      // Por enquanto: Admin gerencia.
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition text-xs font-bold ${(exp.attachments?.length || 0) > 0 || exp.attachmentUrl ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white' : 'bg-slate-800 text-slate-500 hover:text-white'
                        }`}
                    >
                      <i className="fa-solid fa-paperclip"></i>
                      {isAdmin ? (
                        (exp.attachments?.length || (exp.attachmentUrl ? 1 : 0)) > 0 ?
                          `${exp.attachments?.length || 1} Anexo(s)` : 'Adicionar Anexo'
                      ) : (
                        'Ver Anexo'
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {project.expenses.length === 0 && (
            <div className="text-center py-10 text-slate-500">Nenhuma despesa registrada.</div>
          )}
        </div>

        {/* Desktop: Tabela Tradicional */}
        <div className="hidden md:block glass rounded-2xl border border-slate-700 overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-800 border-b border-slate-700 text-slate-400 font-black uppercase text-[10px] tracking-widest">
              <tr>
                <th className="px-4 py-4">Data</th>
                <th className="px-4 py-4">Descrição</th>
                <th className="px-4 py-4">Etapa</th>
                {/* Item é do plano ObraPro. No Free a coluna some (mesmo critério do
                    importador de planilha) — o convite para assinar aparece na hora
                    de lançar a despesa, que é onde a pessoa sente falta. */}
                {ent.canUseItens && <th className="px-4 py-4">Item</th>}
                <th className="px-4 py-4">Autor</th>
                <th className="px-4 py-4 text-right">Valor</th>
                {isAdmin && <th className="px-4 py-4 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedExpenses.map((exp) => {
                const isEditing = editingExpenseId === exp.id;
                return (
                  <tr key={exp.id} className="hover:bg-slate-800/50 transition">
                    <td className="px-4 py-4 w-36">
                      {isEditing ? (
                        <DateInput
                          className="p-2 bg-slate-700 border border-slate-600 rounded-lg text-xs outline-none focus:border-blue-500 font-bold text-white w-28 text-center"
                          value={exp.date}
                          onBlur={(val) => handleEditExpense(exp.id, { date: val })}
                        />
                      ) : (
                        <span className="font-bold text-slate-300">
                          {(() => {
                            if (!exp.date) return <span className="text-amber-400/80 italic">Sem data</span>;
                            const [y, m, d] = exp.date.split('-');
                            return `${d}/${m}/${y}`;
                          })()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-bold text-white">
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <input
                            onFocus={(e) => e.target.select()}
                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white w-full outline-none"
                            value={tempDescription}
                            onChange={(e) => setTempDescription(e.target.value)}
                            onBlur={() => handleEditExpense(exp.id, { description: tempDescription })}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                          {(project.investors || []).length > 0 && (
                            <select
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-[10px] font-bold text-amber-300 w-full outline-none"
                              value={exp.paidByInvestorId || ''}
                              onChange={(e) => handleEditExpense(exp.id, { paidByInvestorId: e.target.value || undefined })}
                            >
                              <option value="">Pago pelo caixa</option>
                              {(project.investors || []).map((i) => (
                                <option key={i.id} value={i.id}>Pago por {i.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {exp.description}
                          {payerName(exp.paidByInvestorId) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[9px] font-black uppercase tracking-wider">
                              <i className="fa-solid fa-hand-holding-dollar"></i> {payerName(exp.paidByInvestorId)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isEditing && projectMacros.length > 0 ? (
                        <select
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white w-full outline-none"
                          value={exp.macroId || ''}
                          onChange={(e) => handleEditExpense(exp.id, { macroId: e.target.value || undefined })}
                        >
                          <option value="">Sem categoria</option>
                          {projectMacros.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-blue-400">
                          {projectMacros.find(m => m.id === exp.macroId)?.name || <span className="text-slate-600">—</span>}
                        </span>
                      )}
                    </td>

                    {/* Coluna Item (lista plana da obra) — só no ObraPro */}
                    {ent.canUseItens && (
                    <td className="px-4 py-4">
                      {isEditing && projectItems.length > 0 ? (
                        <select
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white w-full outline-none"
                          value={exp.itemId || ''}
                          onChange={(e) => handleEditExpense(exp.id, { itemId: e.target.value || undefined })}
                        >
                          <option value="">Sem item</option>
                          {projectItems.map(it => (
                            <option key={it.id} value={it.id}>{it.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">
                          {projectItems.find(it => it.id === exp.itemId)?.name || <span className="text-slate-700 opacity-50">—</span>}
                        </span>
                      )}
                    </td>
                    )}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-400 border border-slate-600">
                          {(exp.userName && exp.userName[0]) ? exp.userName[0].toUpperCase() : '-'}
                        </div>
                        <span className="text-slate-400 font-bold text-xs">{exp.userName || 'Sistema'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right w-36">
                      {isEditing ? (
                        <MoneyInput
                          className="p-2 bg-slate-700 border border-slate-600 rounded-lg text-xs text-right w-28 outline-none focus:border-blue-500 font-bold text-green-400"
                          value={exp.value}
                          onBlur={(val) => handleEditExpense(exp.id, { value: val })}
                        />
                      ) : (
                        <span className="font-bold text-green-400">{formatCurrency(exp.value)}</span>
                      )}
                    </td>
                    {
                      isAdmin && (
                        <td className="px-4 py-4 text-center w-36">
                          <div className="flex items-center justify-center gap-1">
                            {/* Botão Anexo Desktop */}
                            <button
                              type="button"
                              onClick={() => setAttachmentManagerId(exp.id)}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${(exp.attachments?.length || (exp.attachmentUrl ? 1 : 0)) > 0
                                ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white'
                                : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-white'
                                }`}
                              title="Gerenciar Anexos"
                            >
                              <i className="fa-solid fa-paperclip"></i>
                              {(exp.attachments?.length || 0) > 1 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full pointer-events-none">
                                  {exp.attachments?.length}
                                </span>
                              )}
                            </button>

                            {isEditing ? (
                              <button onClick={() => setEditingExpenseId(null)} className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition flex items-center justify-center">
                                <i className="fa-solid fa-check"></i>
                              </button>
                            ) : (
                              <>
                                <button onClick={() => {
                                  setEditingExpenseId(exp.id);
                                  setTempDescription(exp.description);
                                }} className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white transition border border-slate-700 flex items-center justify-center">
                                  <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button onClick={() => setExpenseToDelete(exp.id)} className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:bg-red-400 hover:text-white transition border border-slate-700 flex items-center justify-center">
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )
                    }
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div >
  );
};
const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  user,
  onUpdate,
  onDeleteUnit,
  onDeleteExpense: onDeleteExpenseProp,
  onDeleteDocument: onDeleteDocumentProp,
  onRefresh,
  onUpdateDiary,
  onDeleteDiary
}) => {
  // 1. URL State for Project Tabs
  const initialParams = new URLSearchParams(window.location.search);
  const initialTab = (initialParams.get('tab') as any) || 'info';

  // Compat: converte nomes de área que cheguei a usar (e links já abertos) de
  // volta pras abas separadas. Passa direto qualquer aba válida.
  const mapTab = (raw: any): ObraTab => {
    const alias: Record<string, ObraTab> = {
      overview: 'info', financeiro: 'expenses', orcamento: 'budget', evolucao: 'diary', relatorios: 'documents',
    };
    const v = String(raw);
    const valid: ObraTab[] = ['info', 'units', 'expenses', 'socios', 'budget', 'documents', 'diary'];
    return alias[v] || (valid.includes(v as ObraTab) ? (v as ObraTab) : 'info');
  };

  const [activeTab, setActiveTab] = useState<ObraTab>(mapTab(initialTab));

  // Sync internal tab to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab) {
      params.set('tab', activeTab);
      const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [activeTab]);

  // Listen for external navigation (e.g., App's back button)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) setActiveTab(mapTab(tab));
    };
    window.addEventListener('navigate-tab', handler);
    return () => window.removeEventListener('navigate-tab', handler);
  }, []);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [evidenceModal, setEvidenceModal] = useState<{ isOpen: boolean; stage: number; evidence?: any }>({ isOpen: false, stage: 0 });
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  // Safety patch for potential ghost reference
  const [attachmentManagerId, setAttachmentManagerId] = useState<string | null>(null);

  const isAdmin = user.role === UserRole.ADMIN;
  const canSeeUnits = user.canSeeUnits || isAdmin;

  // Cálculos defensivos para dados antigos
  const totalActualExpenses = project.expenses.reduce((acc, curr) => acc + curr.value, 0);
  const totalUnitsCost = project.units.reduce((acc, curr) => acc + curr.cost, 0);
  const totalUnitsSales = project.units.reduce((acc, curr) => acc + (curr.saleValue || 0), 0);

  /* Safe Calculation Helpers */
  const safeSum = (arr: any[], key: string) => arr.reduce((acc, curr) => acc + (Number(curr[key]) || 0), 0);
  const safeDiff = (a: number, b: number) => (Number(a) || 0) - (Number(b) || 0);

  // URL Action Handling (Modal Deep Linking)
  const initialAction = initialParams.get('action');

  const { inflationRate } = useInflation();

  // Nova Lógica Financeira (valorEstimadoVenda)
  const totalEstimatedSales = project.units.reduce((acc, curr) => acc + (curr.valorEstimadoVenda || 0), 0);
  const estimatedGrossProfit = safeDiff(totalEstimatedSales, totalUnitsCost);

  const firstExpense = project.expenses.length > 0
    ? project.expenses.reduce((min, e) => (e.date && min.date && e.date < min.date) ? e : min, project.expenses[0])
    : null;

  // New/Refined Metrics for Dashboard
  const soldUnits = project.units.filter(u => u.status === 'Sold');
  const availableUnits = project.units.filter(u => u.status === 'Available');

  const potentialSales = availableUnits.reduce((acc, curr) => acc + (curr.valorEstimadoVenda || 0), 0);

  // Force Scroll to Top on Mount/Tab Change (Anchor Method)


  useLayoutEffect(() => {
    // 1. Disable browser's automatic scroll restoration
    if (window.history.scrollRestoration) {
      window.history.scrollRestoration = 'manual';
    }

    // 2. Function to nuke scroll position
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.body.scrollTo(0, 0);
      document.documentElement.scrollTo(0, 0);

      const mainContainer = document.querySelector('main');
      if (mainContainer) mainContainer.scrollTo(0, 0);

      const root = document.getElementById('root');
      if (root) root.scrollTo(0, 0);
    };

    // 3. Scheduling bombardement
    resetScroll();

    // Multiple attempts to align with React concurrent rendering and mobile browser painting
    // Extended duration for slower devices
    const timers = [
      setTimeout(resetScroll, 0),
      setTimeout(resetScroll, 20),
      setTimeout(resetScroll, 50),
      setTimeout(resetScroll, 100),
      setTimeout(resetScroll, 300),
      setTimeout(resetScroll, 600)
    ];

    return () => timers.forEach(clearTimeout);
  }, [activeTab]);

  const realProfit = soldUnits.reduce((acc, unit) => {
    // Logic extracted from existing margin calc
    const isCompleted = project.progress === 100;
    const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);

    let costBase = unit.cost;
    if (isCompleted && totalUnitsArea > 0) {
      costBase = (unit.area / totalUnitsArea) * totalActualExpenses;
    }

    // Only calculate if we have a sale value
    if (unit.saleValue && unit.saleValue > 0) {
      return acc + (unit.saleValue - costBase);
    }
    return acc;
  }, 0);

  // Re-calculating margins cleanly
  const margins = useMemo(() => {
    let totalRoi = 0;
    let totalMonthlyRoi = 0;
    let count = 0;

    const isCompleted = project.progress === 100;
    const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);

    soldUnits.forEach(unit => {
      if (unit.saleValue && unit.saleValue > 0) {
        let costBase = unit.cost;
        if (isCompleted && totalUnitsArea > 0) {
          costBase = (unit.area / totalUnitsArea) * totalActualExpenses;
        }

        if (costBase > 0) {
          const roi = (unit.saleValue - costBase) / costBase;
          totalRoi += roi;

          // Monthly
          if (unit.saleDate && firstExpense) {
            const months = calculateMonthsBetween(firstExpense.date, unit.saleDate);
            if (months > 0) totalMonthlyRoi += (roi / months);
          }
          count++;
        }
      }
    });

    return {
      avgRoi: count > 0 ? (totalRoi / count) * 100 : 0,
      avgMonthlyRoi: count > 0 ? (totalMonthlyRoi / count) * 100 : 0
    };
  }, [project.units, project.expenses, project.progress, totalActualExpenses, soldUnits, firstExpense]);

  const budgetUsage = totalUnitsCost > 0 ? (totalActualExpenses / totalUnitsCost) * 100 : 0;

  // Etapas da obra derivadas do orçamento (% editável lá) — fonte única.
  const projectStages = getProjectStages(project);
  const stageValues = [...projectStages.map((s) => s.value), 100];
  // Etapas + nó de conclusão, para o stepper visual.
  const stepperStages = [...projectStages, { value: 100, weight: 0, name: 'Obra Concluída', short: '✓', icon: 'fa-trophy' }];
  const currentStageIndex = getStageIndex(projectStages, project.progress);
  const currentStageStart = currentStageIndex < projectStages.length ? projectStages[currentStageIndex].value : 100;
  const currentStageEnd = stageValues[currentStageIndex + 1] ?? 101;
  // Foto de uma etapa: casa por FAIXA [início, próximo) — assim evidências antigas
  // (salvas com os valores do modelo antigo) ainda aparecem na etapa certa.
  const evidenceInRange = (startVal: number, endVal: number) =>
    project.stageEvidence?.find((e) => e.stage >= startVal && e.stage < endVal);

  // Prestação de contas (gasto × avanço) — fundida no card "Andamento da Obra"
  const finance = computeProjectFinance(project);
  // Veredito Gasto × Avanço — fonte única compartilhada com o link e o PDF.
  const _verdito = computeGastoAvancoVerdito(finance);
  const _toneCls = ({
    neutral: { cor: 'text-slate-400', bar: 'bg-slate-600' },
    warning: { cor: 'text-amber-400', bar: 'bg-amber-500' },
    good: { cor: 'text-emerald-400', bar: 'bg-emerald-500' },
  } as const)[_verdito.tone];
  const gastoAvancoVerdito = { texto: _verdito.texto, icon: _verdito.icon, cor: _toneCls.cor, bar: _toneCls.bar };

  const logChange = (action: string, field: string, oldVal: string, newVal: string) => {
    const newLog = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.login,
      action,
      field,
      oldValue: oldVal,
      newValue: newVal
    };
    onUpdate(project.id, { logs: [...project.logs, newLog] });
  };

  const handleStageChange = (newStage: ProgressStage) => {
    if (newStage === project.progress) return;

    // Concluir a obra é deliberado: destrava o cálculo do LUCRO REAL
    if (newStage === ProgressStage.COMPLETED && project.progress !== ProgressStage.COMPLETED) {
      const ok = window.confirm(
        'Marcar a obra como CONCLUÍDA?\n\n' +
        'Isso libera o cálculo do LUCRO REAL. Confirme que todas as despesas já foram lançadas — ' +
        'senão o lucro real sairá incorreto.\n\nVocê pode reabrir depois voltando uma etapa.'
      );
      if (!ok) return;
    }

    const oldName = getStageName(project.progress, project);
    const newName = getStageName(newStage, project);

    // If going BACK to a previous stage, clear evidence from stages after the new stage
    if (newStage < project.progress) {
      const currentEvidences = project.stageEvidence || [];
      // Keep only evidences for stages <= newStage
      const filteredEvidences = currentEvidences.filter(e => e.stage <= newStage);

      // Update progress AND clear future evidences
      onUpdate(project.id, {
        progress: newStage,
        stageEvidence: filteredEvidences
      }, `Retorno de etapa: ${oldName} -> ${newName} (evidências posteriores removidas)`);
    } else {
      // Going forward - update progress
      onUpdate(project.id, { progress: newStage }, `Progresso: ${oldName} -> ${newName}`);

      // Prompt for evidence of the NEW CURRENT stage (the one we just advanced to)
      const evidence = project.stageEvidence?.find(e => e.stage === newStage);
      setEvidenceModal({
        isOpen: true,
        stage: newStage,
        evidence
      });
    }
  };

  const handleSaveEvidence = async (photos: string[], notes: string, date: string) => {
    const { stage } = evidenceModal;
    const currentEvidences = project.stageEvidence || [];
    const otherEvidences = currentEvidences.filter(e => e.stage !== stage);

    const newEvidence = {
      stage,
      photos,
      notes,
      date: date || new Date().toISOString().split('T')[0],
      user: user.login
    };

    const updatedEvidences = [...otherEvidences, newEvidence];
    await onUpdate(project.id, { stageEvidence: updatedEvidences }, `Evidência de etapa: ${STAGE_NAMES[stage]}`);
  };

  const handleAddUnit = async (unitOrUnits: Omit<Unit, 'id'> | Omit<Unit, 'id'>[]): Promise<void> => {
    console.log('=== DEBUG: handleAddUnit chamado ===');

    const unitsToAdd = Array.isArray(unitOrUnits) ? unitOrUnits : [unitOrUnits];

    const newUnitsFromServer: Unit[] = unitsToAdd.map(u => ({
      ...u,
      id: generateId(),
      status: u.status || 'Available'
    })) as Unit[];

    const newUnits = [...project.units, ...newUnitsFromServer];

    // Persistir no banco e aguardar
    await onUpdate(project.id, {
      units: newUnits,
      expectedTotalCost: newUnits.reduce((sum, u) => sum + (u.cost || 0), 0),
      expectedTotalSales: newUnits.reduce((sum, u) => sum + (u.saleValue || u.valorEstimadoVenda || 0), 0)
    });

    // Log individual ou em lote
    if (newUnitsFromServer.length === 1) {
      logChange('Inclusão', 'Unidade', '-', newUnitsFromServer[0].identifier);
    } else {
      logChange('Inclusão', 'Unidades (Lote)', '-', `${newUnitsFromServer.length} unidades adicionadas`);
    }
    console.log('=== DEBUG: handleAddUnit concluído ===');
  };

  const handleUpdateUnit = (unitId: string, updates: Partial<Unit>) => {
    const oldUnit = project.units.find(u => u.id === unitId)!;

    let finalUpdates = { ...updates };
    const currentSaleValue = updates.hasOwnProperty('saleValue') ? updates.saleValue : oldUnit.saleValue;

    if (currentSaleValue && currentSaleValue > 0) {
      finalUpdates.status = 'Sold';
    } else {
      finalUpdates.status = 'Available';
    }

    const newUnits = project.units.map(u => u.id === unitId ? { ...u, ...finalUpdates } : u);

    onUpdate(project.id, {
      units: newUnits,
      expectedTotalSales: newUnits.reduce((a, b) => a + (b.saleValue || b.valorEstimadoVenda || 0), 0)
    });

    Object.keys(finalUpdates).forEach(key => {
      const field = key as keyof Unit;
      logChange('Alteração', `Unidade ${oldUnit.identifier} - ${field}`, String(oldUnit[field] || '-'), String(finalUpdates[field]));
    });
  };

  // Se a despesa é de uma etapa À FRENTE da atual, sugere avançar a obra pra ela.
  // O avanço continua manual — isto é só um atalho quando o gasto denuncia a virada de etapa.
  const maybeSuggestStageAdvance = (macroId?: string) => {
    if (!macroId || project.progress >= 100) return;
    const macros = project.budget?.macros;
    if (!macros || macros.length === 0) return;
    const ordered = [...macros].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    const macroIdx = ordered.findIndex((m) => m.id === macroId);
    if (macroIdx < 0 || macroIdx <= currentStageIndex) return; // já estamos nessa etapa ou além
    const targetStage = projectStages[macroIdx];
    if (!targetStage) return;
    // Adia o prompt pra depois do modal de despesa fechar.
    setTimeout(() => {
      const ok = window.confirm(
        `Você lançou uma despesa na etapa "${ordered[macroIdx].name}", que está à frente da etapa atual da obra ` +
        `("${getStageName(project.progress, project)}").\n\nDeseja avançar a obra para "${ordered[macroIdx].name}"?`
      );
      if (ok) handleStageChange(targetStage.value);
    }, 150);
  };

  const handleAddExpense = (exp: Omit<Expense, 'id' | 'userId' | 'userName'>) => {
    const newExpense = { ...exp, id: generateId(), userId: user.id, userName: user.login };
    onUpdate(project.id, { expenses: [...project.expenses, newExpense] });
    logChange('Inclusão', 'Despesa', '-', exp.description);
    maybeSuggestStageAdvance(exp.macroId);
  };

  const handleEditExpense = (id: string, field: keyof Expense, value: any) => {
    const oldExpense = project.expenses.find(e => e.id === id);
    if (!oldExpense) return;

    const newExpenses = project.expenses.map(e => e.id === id ? { ...e, [field]: value } : e);
    onUpdate(project.id, { expenses: newExpenses });
    logChange('Alteração', `Despesa - ${field}`, String(oldExpense[field]), String(value));
  };

  const onDeleteExpense = (id: string) => {
    onDeleteExpenseProp(project.id, id);
    // logChange agora é responsabilidade do pai ou do hook se quisermos manter consistência, 
    // mas o pai (App.tsx) vai lidar com o log.
  };

  const handleAddDocument = (doc: any) => {
    const newDoc = {
      id: generateId(),
      title: doc.title,
      category: doc.category,
      url: doc.url,
      createdAt: new Date().toISOString()
    };
    const newDocuments = [...(project.documents || []), newDoc];
    onUpdate(project.id, { documents: newDocuments }, `Adicionado documento: ${doc.title}`);
  };

  const handleDeleteDocument = (id: string) => {
    if (onDeleteDocumentProp) {
      onDeleteDocumentProp(project.id, id);
    }
  };

  const handleAddDiaryEntry = (entry: any) => {
    const newEntry = {
      id: generateId(),
      date: entry.date,
      content: entry.content,
      photos: entry.photos,
      author: entry.author,
      createdAt: new Date().toISOString()
    };
    const newDiary = [...(project.diary || []), newEntry];
    onUpdate(project.id, { diary: newDiary }, `Diário: nova entrada`);
  };

  // Scroll to current stage on load
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab === 'info' && scrollContainerRef.current) {
      // Small timeout to ensure rendering
      setTimeout(() => {
        const currentElement = document.getElementById('current-stage-indicator');
        const container = scrollContainerRef.current;
        if (currentElement && container) {
          const containerRect = container.getBoundingClientRect();
          const elementRect = currentElement.getBoundingClientRect();

          // Calculate offset relative to the container scroll
          const relativeLeft = elementRect.left - containerRect.left + container.scrollLeft;

          // Center: relativeLeft - halfContainer + halfElement
          const scrollLeft = relativeLeft - (container.clientWidth / 2) + (elementRect.width / 2);

          container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
      }, 300);
    }
  }, [activeTab, project.progress]);

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Container Principal - Dark Theme (Mobile: Flat / Desktop: Card) */}
      <div className="md:glass md:rounded-3xl md:p-8 space-y-6">
        {/* Navegação de Abas - Dark Theme */}
        {/* Navegação BENTO GRID - Redesign Premium */}
        {/* Navegação BENTO GRID - Redesign Premium "Chunky" */}
        {/* Navegação de Abas - Framed Tech Design */}
        <div className="mb-8 w-full px-4 md:px-0">
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-2 md:gap-4">
            {/* 1. GESTÃO — full-width no mobile, botão normal no desktop */}
            <button
              onClick={() => setActiveTab('info')}
              className={`col-span-2 lg:col-span-1 h-16 md:h-24 flex flex-row lg:flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'info'
                ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                }`}
            >
              <i className={`fa-solid fa-gauge-high text-xl md:text-2xl ${activeTab === 'info' ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`}></i>
              <span className={`text-xs lg:text-[10px] font-black uppercase tracking-widest ${activeTab === 'info' ? 'text-white' : 'text-slate-400'}`}>Gestão</span>
            </button>

            {/* 2. SÓCIOS — aportes, saldo por sócio, divisão */}
            <button
              onClick={() => setActiveTab('socios')}
              className={`h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'socios'
                ? 'bg-emerald-600/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                }`}
            >
              <i className={`fa-solid fa-hand-holding-dollar text-lg md:text-2xl ${activeTab === 'socios' ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'socios' ? 'text-white' : 'text-slate-400'}`}>Sócios</span>
            </button>

            {/* 3. DESPESAS — gastos + aquisição */}
            <button
              onClick={() => setActiveTab('expenses')}
              className={`h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'expenses'
                ? 'bg-rose-600/20 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                }`}
            >
              <i className={`fa-solid fa-wallet text-lg md:text-2xl ${activeTab === 'expenses' ? 'text-rose-400' : 'text-slate-500 group-hover:text-rose-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'expenses' ? 'text-white' : 'text-slate-400'}`}>Despesas</span>
            </button>

            {/* 4. UNIDADES — opcional */}
            {canSeeUnits && (
              <button
                onClick={() => setActiveTab('units')}
                className={`h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'units'
                  ? 'bg-teal-600/20 border-teal-500 shadow-[0_0_15px_rgba(20,184,166,0.3)]'
                  : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                  }`}
              >
                <i className={`fa-solid fa-house-user text-lg md:text-2xl ${activeTab === 'units' ? 'text-teal-400' : 'text-slate-500 group-hover:text-teal-400'}`}></i>
                <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'units' ? 'text-white' : 'text-slate-400'}`}>Unidades</span>
              </button>
            )}

            {/* 5. ORÇAMENTO — por etapa / por item */}
            <button
              onClick={() => setActiveTab('budget')}
              className={`h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'budget'
                ? 'bg-purple-600/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                }`}
            >
              <i className={`fa-solid fa-chart-pie text-lg md:text-2xl ${activeTab === 'budget' ? 'text-purple-400' : 'text-slate-500 group-hover:text-purple-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'budget' ? 'text-white' : 'text-slate-400'}`}>Orçamento</span>
            </button>

            {/* 6. DOCS */}
            <button
              onClick={() => setActiveTab('documents')}
              className={`h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'documents'
                ? 'bg-amber-600/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                }`}
            >
              <i className={`fa-solid fa-folder-open text-lg md:text-2xl ${activeTab === 'documents' ? 'text-amber-400' : 'text-slate-500 group-hover:text-amber-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'documents' ? 'text-white' : 'text-slate-400'}`}>Docs</span>
            </button>

            {/* 7. DIÁRIO — registro de fatos extraordinários */}
            <button
              onClick={() => setActiveTab('diary')}
              className={`h-16 md:h-24 flex flex-col items-center justify-center gap-1 md:gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'diary'
                ? 'bg-cyan-600/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 hover:-translate-y-2'
                }`}
            >
              <i className={`fa-solid fa-book-open text-lg md:text-2xl ${activeTab === 'diary' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'diary' ? 'text-white' : 'text-slate-400'}`}>Diário</span>
            </button>
          </div>
        </div>


        {/* ===== ABA GESTÃO - Redesign Premium ===== */}
        {activeTab === 'info' && (
          <div className="animate-fade-in space-y-8">

            {/* HERÓI MOBILE: Etapa Atual em Destaque - Clicável */}
            <button
              onClick={() => {
                const currEvidence = evidenceInRange(currentStageStart, currentStageEnd);
                setEvidenceModal({ isOpen: true, stage: currentStageStart, evidence: currEvidence });
              }}
              className="md:hidden glass rounded-3xl overflow-hidden relative aspect-video shadow-2xl border border-slate-700 w-full text-left group"
            >
              {(() => {
                const currEvidence = evidenceInRange(currentStageStart, currentStageEnd);
                const photo = currEvidence?.photos?.[0];
                const stageName = getStageName(project.progress, project);
                const stageDate = currEvidence?.date ? new Date(currEvidence.date).toLocaleDateString('pt-BR') : null;

                return (
                  <>
                    {photo ? (
                      <StageThumbnail photoPath={photo} className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-slate-900 opacity-80"></div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>

                    {/* Edit indicator on hover */}
                    <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-blue-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <i className="fa-solid fa-pen text-white text-sm"></i>
                    </div>

                    <div className="absolute bottom-0 left-0 p-6 w-full">
                      <div className="bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded inline-block mb-2">
                        Etapa Atual
                      </div>
                      <h2 className="text-3xl font-black text-white leading-tight mb-1">{stageName}</h2>
                      <div className="flex items-center gap-4">
                        <p className="text-slate-300 text-xs font-bold">{project.progress}% Concluído</p>
                        {stageDate && (
                          <p className="text-blue-400 text-xs font-bold">
                            <i className="fa-solid fa-calendar-check mr-1"></i>{stageDate}
                          </p>
                        )}
                      </div>
                      {currEvidence?.photos && currEvidence.photos.length > 0 && (
                        <div className="inline-flex items-center gap-1 bg-green-500/30 px-2 py-1 rounded-full text-[10px] font-bold text-green-300 border border-green-500/40 mt-2">
                          <i className="fa-solid fa-image"></i> {currEvidence.photos.length} foto{currEvidence.photos.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </button>



            {/* Navegação de etapa (mobile) — avançar/voltar sem depender do stepper horizontal */}
            <div className="md:hidden flex items-center justify-between gap-2 mb-6">
              {(() => {
                // Usa o índice por FAIXA (igual ao stepper do desktop) — não exige
                // que project.progress bata exatamente num valor de etapa.
                const idx = currentStageIndex;
                const prev = idx > 0 ? stageValues[idx - 1] : null;
                const next = idx >= 0 && idx < stageValues.length - 1 ? stageValues[idx + 1] : null;
                return (
                  <>
                    <button
                      disabled={prev === null}
                      onClick={() => prev !== null && handleStageChange(prev)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 font-black text-[11px] uppercase tracking-widest disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      <i className="fa-solid fa-chevron-left"></i> Anterior
                    </button>
                    <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap px-1">
                      {idx + 1}/{stageValues.length}
                    </span>
                    <button
                      disabled={next === null}
                      onClick={() => next !== null && handleStageChange(next)}
                      className="flex-1 py-2.5 rounded-xl border border-blue-500/50 bg-blue-600/20 text-blue-300 font-black text-[11px] uppercase tracking-widest disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      Próxima <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  </>
                );
              })()}
            </div>

            {/* Cronograma de Obra - Opção Visual com Fotos */}
            <div ref={scrollContainerRef} className="glass rounded-2xl p-3 md:p-6 border border-slate-700 overflow-x-auto">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8 sticky left-0">
                <h3 className="font-black text-white text-xs md:text-sm uppercase tracking-wide md:tracking-widest flex items-center gap-2 whitespace-nowrap shrink-0">
                  <i className="fa-solid fa-timeline text-blue-400"></i>
                  <span>Andamento da Obra</span>
                </h3>
                <div className="flex items-center gap-3 shrink-0">
                  {/* Concluir / Reabrir obra */}
                  {isAdmin && (
                    project.progress >= 100 ? (
                      <button
                        onClick={() => handleStageChange(stageValues[stageValues.length - 2] ?? 0)}
                        className="px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 rounded-full text-xs font-bold hover:bg-slate-700 hover:text-white transition-all flex items-center gap-2"
                        title="Reabrir a obra (volta para a última etapa)"
                      >
                        <i className="fa-solid fa-lock-open text-amber-400"></i>
                        <span className="hidden md:inline">Reabrir</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStageChange(100)}
                        className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/50 text-emerald-400 rounded-full text-xs font-black uppercase tracking-wider hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-2"
                        title="Marcar obra como concluída (libera o lucro real)"
                      >
                        <i className="fa-solid fa-flag-checkered"></i>
                        <span className="hidden md:inline">Concluir obra</span>
                      </button>
                    )
                  )}

                  {/* Compartilhar relatório (link + PDF no mesmo modal) */}
                  <button
                    onClick={() => setShowShareModal(true)}
                    className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-400 rounded-full text-xs font-bold hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                    title="Compartilhar relatório (link ou PDF)"
                  >
                    <i className="fa-solid fa-share-nodes"></i>
                    <span className="hidden md:inline">Compartilhar</span>
                  </button>

                  {/* Schedule (Cronograma) Button */}
                  <button
                    onClick={() => setShowSchedule(true)}
                    className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-400 rounded-full text-xs font-bold hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                    title="Ver Cronograma Físico-Financeiro"
                  >
                    <i className="fa-solid fa-calendar-days text-blue-400"></i>
                    <span className="hidden md:inline">Cronograma</span>
                  </button>
                </div>
              </div>

              {/* Gasto × Avanço (prestação de contas) — fundido com a linha do tempo */}
              <div className="mb-8 sticky left-0 w-full">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 truncate">Gasto × Avanço</p>
                  <span className="text-xs font-bold text-white whitespace-nowrap">{finance.gastoPct.toFixed(0)}% gasto · {finance.progresso.toFixed(0)}% obra</span>
                </div>
                <div className="relative bg-slate-800 rounded-full h-4 overflow-hidden border border-slate-700">
                  <div className={`h-full rounded-full transition-all duration-700 ${gastoAvancoVerdito.bar}`} style={{ width: `${Math.min(finance.gastoPct, 100)}%` }}></div>
                  <div className="absolute top-0 bottom-0 w-1 bg-white" style={{ left: `${Math.min(finance.progresso, 100)}%` }} title={`Progresso ${finance.progresso.toFixed(0)}%`}></div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-2 gap-1">
                  <p className={`text-[11px] sm:text-xs font-bold ${gastoAvancoVerdito.cor}`}>
                    <i className={`fa-solid ${gastoAvancoVerdito.icon} mr-1`}></i>{gastoAvancoVerdito.texto}
                  </p>
                  <span className="text-[10px] text-slate-500 shrink-0 whitespace-nowrap">Gasto {formatCurrencyAbbrev(finance.gasto)} de {formatCurrencyAbbrev(finance.orcamentoObra)}</span>
                </div>
              </div>

              {/* Stepper Visual Fotos — só no desktop (no mobile usamos o card "Etapa Atual") */}
              <div className="hidden md:block relative py-1 md:py-4 w-full md:min-w-[800px] px-4 md:px-10">
                {/* Linha de fundo */}
                <div className="absolute top-1/2 left-0 right-0 h-[4px] bg-slate-800 rounded-full -translate-y-1/2 z-0"></div>

                {/* Linha de progresso */}
                <div
                  className="absolute top-1/2 left-0 h-[4px] rounded-full -translate-y-1/2 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 z-0"
                  style={{ width: `${project.progress}%` }}
                ></div>

                {/* Dots com Fotos */}
                <div className="relative flex justify-between items-center z-10 w-full">
                  {stepperStages.map((st, i) => {
                    const stage = st.value;
                    const nextVal = stageValues[i + 1] ?? 101;
                    const isCurrent = i === currentStageIndex;
                    const isPast = i < currentStageIndex;
                    const isCompleted = i <= currentStageIndex;
                    const evidence = evidenceInRange(stage, nextVal);
                    const photo = evidence?.photos?.[0]; // Pega a primeira foto
                    const stageDate = evidence?.date ? new Date(evidence.date).toLocaleDateString('pt-BR') : null;

                    return (
                      <div key={stage} className="flex flex-col items-center gap-2 relative group">

                        {/* Tooltip com nome e data da etapa - aparece no hover (para todas etapas) */}
                        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-center font-bold px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-30 border border-slate-600 shadow-xl pointer-events-none">
                          <p className="text-[10px] uppercase tracking-wider">{st.name}</p>
                          {stageDate && (
                            <p className="text-[9px] text-blue-400 mt-0.5">
                              <i className="fa-solid fa-calendar-check mr-1"></i>{stageDate}
                            </p>
                          )}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>

                        <button
                          id={isCurrent ? 'current-stage-indicator' : undefined}
                          disabled={false}
                          onClick={() => {
                            if (isCurrent) {
                              // Current stage - open evidence modal for editing
                              setEvidenceModal({ isOpen: true, stage, evidence });
                            } else if (isPast) {
                              // Past stage - ask if want to go back or view evidence
                              const goBack = window.confirm(`Deseja voltar para a etapa "${st.name}"?\n\nClique "OK" para voltar, ou "Cancelar" para ver as fotos.`);
                              if (goBack) {
                                handleStageChange(stage);
                              } else {
                                setEvidenceModal({ isOpen: true, stage, evidence });
                              }
                            } else {
                              // Future stage - advance to it
                              handleStageChange(stage);
                            }
                          }}
                          className={`relative rounded-full transition-all duration-300 flex items-center justify-center overflow-hidden border-4 shadow-xl ${isCurrent
                            ? 'w-16 h-16 md:w-24 md:h-24 ring-4 ring-blue-500/40 border-blue-500 scale-110'
                            : isCompleted
                              ? 'w-12 h-12 border-blue-500/50 hover:border-blue-400 opacity-90'
                              : 'w-12 h-12 border-slate-700 bg-slate-800 opacity-50 grayscale'
                            }`}
                        >
                          {photo ? (
                            <StageThumbnail photoPath={photo} className="w-full h-full" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${isCompleted ? 'bg-slate-700' : 'bg-slate-800'}`}>
                              <i className={`fa-solid ${st.icon} ${isCurrent ? 'text-blue-400 text-xl' : isCompleted ? 'text-blue-400 text-sm' : 'text-slate-600 text-sm'}`}></i>
                            </div>
                          )}

                          {/* Overlay - shows camera for current, arrow for past */}
                          {isCompleted && (
                            <div className="absolute inset-0 bg-blue-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              {isPast ? (
                                <i className="fa-solid fa-rotate-left text-white drop-shadow-md"></i>
                              ) : (
                                <i className="fa-solid fa-camera text-white text-lg drop-shadow-md"></i>
                              )}
                            </div>
                          )}
                        </button>

                        {/* Label - ONLY show for current stage with name and date */}
                        {isCurrent && (
                          <div className="text-center min-w-max">
                            <p className="text-[11px] font-black uppercase tracking-wider text-blue-400 mb-0.5">
                              {st.name}
                            </p>
                            <p className="text-[10px] text-slate-300 font-bold">
                              <i className="fa-solid fa-calendar-check mr-1 text-blue-400"></i>
                              {stageDate || new Date().toLocaleDateString('pt-BR')}
                            </p>
                            {evidence?.photos && evidence.photos.length > 0 && (
                              <div className="inline-flex items-center gap-1 bg-green-500/20 px-2 py-0.5 rounded-full text-[8px] font-bold text-green-400 border border-green-500/30 mt-1">
                                <i className="fa-solid fa-image"></i> {evidence.photos.length}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Check icon for completed stages (not current) */}
                        {isCompleted && !isCurrent && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-white text-[8px] shadow-lg z-20">
                            <i className="fa-solid fa-check"></i>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Caixa da obra: Aportado - Gasto - Aquisição = Saldo em caixa */}
            <div className="mb-8">
              <CashSummaryCards project={project} />
            </div>

            {/* Últimas movimentações + última atualização da obra */}
            <RecentMovements project={project} />

            {/* Resultado do Empreendimento (Projetado + Realizado) */}
            <ResultadoEmpreendimento project={project} />
          </div>
        )}

        {/* ===== ÁREA FINANCEIRO: aportes + despesas + saldo (+ unidades) ===== */}
        {/* ===== ABA SÓCIOS (aportes, saldo por sócio, divisão) ===== */}
        {activeTab === 'socios' && (
          <div className="animate-fade-in">
            <SociosSection project={project} user={user} onUpdate={onUpdate} />
          </div>
        )}

        {/* ===== ABA DESPESAS (gastos + aquisição) ===== */}
        {activeTab === 'expenses' && (
          <div className="space-y-8 animate-fade-in">
            {/* Terreno / Aquisição — seção separada; NÃO entra no gasto×orçamento da obra */}
            <AquisicaoSection project={project} user={user} />

            <ExpensesSection
              project={project}
              user={user}
              onAddExpense={handleAddExpense}
              onUpdate={(newExpenses) => onUpdate(project.id, { expenses: newExpenses })}
              onDeleteExpense={onDeleteExpense}
              logChange={logChange}
              initialAction={initialAction} // Pass URL action
            />
          </div>
        )}

        {/* ===== ABA UNIDADES (opcional) ===== */}
        {activeTab === 'units' && canSeeUnits && (
          <div className="animate-fade-in">
            <UnitsSection
              project={project}
              user={user}
              onAddUnit={handleAddUnit}
              onUpdateUnit={handleUpdateUnit}
              onDeleteUnit={onDeleteUnit}
              onUpdate={onUpdate}
              logChange={logChange}
            />
          </div>
        )}

        {/* ===== ABA ORÇAMENTO (por etapa / por item) ===== */}
        {activeTab === 'budget' && (
          <div className="animate-fade-in">
            <BudgetSection
              project={project}
              isAdmin={isAdmin}
              onBudgetUpdate={onRefresh}
              onUpdate={onUpdate}
            />
          </div>
        )}

        {/* ===== ABA DOCUMENTOS ===== */}
        {activeTab === 'documents' && (
          <div className="animate-fade-in">
            <DocumentsSection
              documents={project.documents || []}
              onAdd={handleAddDocument}
              onDelete={handleDeleteDocument}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* ===== ABA DIÁRIO: registro de fatos extraordinários ===== */}
        {activeTab === 'diary' && (
          <div className="animate-fade-in">
            <DiarySection
              diary={project.diary || []}
              onAdd={handleAddDiaryEntry}
              onUpdate={onUpdateDiary ? (entry) => onUpdateDiary(project.id, entry) : undefined}
              onDelete={onDeleteDiary ? (entryId) => onDeleteDiary(project.id, entryId) : undefined}
              isAdmin={isAdmin}
              currentUserName={user.login}
            />
          </div>
        )}


      </div>

      {/* Evidence Modal */}
      <StageEvidenceModal
        isOpen={evidenceModal.isOpen}
        onClose={() => setEvidenceModal({ ...evidenceModal, isOpen: false })}
        stage={evidenceModal.stage}
        stageName={getStageName(evidenceModal.stage, project)}
        evidence={evidenceModal.evidence}
        onSave={handleSaveEvidence}
      />

      {showSchedule && (
        <ScheduleView
          project={project}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {showShareModal && (
        <ShareReportModal
          project={project}
          userName={user.login || 'Usuário'}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
};

export default ProjectDetail;
