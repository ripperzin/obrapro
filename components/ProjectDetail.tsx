import React, { useState, useMemo, useEffect } from 'react';
import { Project, User, UserRole, ProgressStage, STAGE_NAMES, STAGE_ICONS, STAGE_ABBREV, Unit, Expense, ProjectMacro, ProjectSubMacro } from '../types';
import { useInflation } from '../hooks/useInflation';
import { PROGRESS_STAGES } from '../constants';
import { formatCurrency, formatCurrencyAbbrev, generateId, calculateMonthsBetween } from '../utils';
import { openAttachment } from '../utils/storage';
import MoneyInput from './MoneyInput';
import { generateProjectPDF } from '../utils/pdfGenerator';
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
import ManageAttachmentsModal from './ManageAttachmentsModal';
import ScheduleView from './ScheduleView';

import { supabase } from '../supabaseClient';

interface ProjectDetailProps {
  project: Project;
  user: User;
  onUpdate: (id: string, updates: Partial<Project>, logMsg?: string) => Promise<void>;
  onDeleteUnit: (projectId: string, unitId: string) => void;
  onRefresh?: () => Promise<void>;
  onUpdateDiary?: (projectId: string, entry: any) => Promise<void>;
  onDeleteDiary?: (projectId: string, entryId: string) => Promise<void>;
}

const UnitsSection: React.FC<{
  project: Project,
  user: User,
  onAddUnit: (u: any) => Promise<void>,
  onUpdateUnit: (id: string, updates: Partial<Unit>) => void,
  onDeleteUnit: (projectId: string, unitId: string) => void,
  logChange: (a: string, f: string, o: string, n: string) => void
}> = ({ project, user, onAddUnit, onUpdateUnit, onDeleteUnit, logChange }) => {
  const [showAdd, setShowAdd] = useState(false);
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
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(new Set());

  const toggleExpansion = (id: string) => {
    const newSet = new Set(expandedUnitIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedUnitIds(newSet);
  };
  const { inflationRate } = useInflation();

  const isAdmin = user.role === UserRole.ADMIN;
  const isCompleted = project.progress === ProgressStage.COMPLETED;
  const canEditVenda = isCompleted || isAdmin;

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
      setShowAdd(false);
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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="font-black text-white text-xl uppercase tracking-tight flex items-center gap-3">
          <i className="fa-solid fa-house-user text-blue-400"></i>
          Portfólio de Unidades
        </h3>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white px-6 py-3 rounded-full font-black text-sm hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 flex items-center gap-2">
            <i className="fa-solid fa-plus"></i> Nova Unidade
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={!!unitToDelete}
        onClose={() => setUnitToDelete(null)}
        onConfirm={() => {
          if (unitToDelete) {
            onDeleteUnit(project.id, unitToDelete);
            setUnitToDelete(null);
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
        onClose={() => setShowAdd(false)}
        onSave={async (unit) => {
          await onAddUnit(unit);
          setShowAdd(false);
        }}
      />

      {/* Grid de Cards de Unidades - Dark Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
        {project.units.map(unit => {
          // Lógica de Custo Real (Obra 100% Concluída)
          const isCompleted = project.progress === 100;
          const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);

          // Calcular a área total REAL baseada na soma das unidades para garantir rateio de 100%
          const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);

          // Custo Real = (Área Unidade / Soma Área Unidades) * Total Despesas
          const realCost = (isCompleted && totalUnitsArea > 0)
            ? (unit.area / totalUnitsArea) * totalExpenses
            : unit.cost;

          // Base para ROI: Se concluída usa realCost, senão unit.cost
          const costBase = isCompleted ? realCost : unit.cost;

          const roi = (unit.saleValue && unit.saleValue > 0 && costBase > 0)
            ? (unit.saleValue - costBase) / costBase
            : null;

          const months = (roi !== null && unit.saleDate && firstExpenseDate)
            ? calculateMonthsBetween(firstExpenseDate, unit.saleDate)
            : null;

          const roiMensal = (roi !== null && months !== null && months > 0) ? roi / months : null;
          const isEditing = editingUnitId === unit.id;

          return (
            <div
              key={unit.id}
              className={`glass rounded-2xl border transition-all ${isEditing ? 'border-orange-500' : 'border-slate-700 hover:border-blue-500/50'} ${expandedUnitIds.has(unit.id) ? 'p-6 shadow-xl' : 'p-4 cursor-pointer hover:bg-slate-800/30'}`}
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
                          onClick={() => setEditingUnitId(null)}
                          className="w-9 h-9 flex items-center justify-center bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500 hover:text-white transition"
                          title="Confirmar"
                        >
                          <i className="fa-solid fa-check"></i>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingUnitId(unit.id); }}
                            className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition border border-slate-700"
                            title="Editar"
                          >
                            <i className="fa-solid fa-pen-to-square text-sm"></i>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setUnitToDelete(unit.id); }}
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

              {/* Conteúdo Expandido */}
              {expandedUnitIds.has(unit.id) && (
                <div className="animate-fade-in">
                  {/* Métricas */}
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                      <span className="text-slate-500 font-bold text-[10px] uppercase">Custo Estimado</span>
                      {isEditing ? (
                        <MoneyInput
                          className="w-28 bg-slate-700 p-2 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-blue-500"
                          value={unit.cost}
                          onBlur={(val) => handleUpdateUnit(unit.id, { cost: val })}
                        />
                      ) : (
                        <span className="font-bold text-white">{formatCurrency(unit.cost)}</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                      <span className="text-blue-400 font-bold text-[10px] uppercase">Venda Estimada</span>
                      {isEditing ? (
                        <MoneyInput
                          className="w-28 bg-slate-700 p-2 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-blue-500"
                          value={unit.valorEstimadoVenda || 0}
                          onBlur={(val) => handleUpdateUnit(unit.id, { valorEstimadoVenda: val })}
                        />
                      ) : (
                        <span className="font-bold text-blue-400">{formatCurrency(unit.valorEstimadoVenda || 0)}</span>
                      )}
                    </div>

                    {/* Custo Real (Apenas 100%) */}
                    {isCompleted && (
                      <div className="flex justify-between items-center p-3 bg-red-500/10 rounded-xl border border-red-500/30">
                        <span className="text-red-400 font-bold text-[10px] uppercase">Custo Real</span>
                        <span className="font-bold text-red-400">{formatCurrency(realCost)}</span>
                      </div>
                    )}
                  </div>

                  {/* Valor de Venda */}
                  {canEditVenda ? (
                    <div className="space-y-3 pt-4 border-t border-slate-700">
                      <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                        <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Valor de Venda</label>
                        <MoneyInput
                          disabled={!isEditing}
                          className={`w-full p-3 rounded-lg text-sm font-bold outline-none transition ${isEditing
                            ? 'bg-slate-700 border border-slate-600 text-white focus:border-blue-500'
                            : 'bg-transparent text-white cursor-default border-none'
                            }`}
                          placeholder="R$ 0,00"
                          value={unit.saleValue || 0}
                          onBlur={(val) => handleUpdateUnit(unit.id, { saleValue: val === 0 ? undefined : val })}
                        />
                      </div>

                      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                        <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Data da Venda</label>
                        <DateInput
                          disabled={!isEditing}
                          className={`w-full p-3 rounded-lg text-sm font-bold outline-none transition ${isEditing
                            ? 'bg-slate-700 border border-slate-600 text-white focus:border-blue-500'
                            : 'bg-transparent text-slate-400 cursor-default border-none'
                            }`}
                          value={unit.saleDate}
                          onBlur={(val) => handleUpdateUnit(unit.id, { saleDate: val === "" ? undefined : val })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-800/50 p-6 rounded-xl text-center border border-dashed border-slate-700 mt-4">
                      <i className="fa-solid fa-lock text-slate-600 text-xl mb-2"></i>
                      <p className="text-[9px] text-slate-500 font-bold uppercase leading-relaxed">Registro de venda<br />após conclusão da obra</p>
                    </div>
                  )}

                  {/* ROI Pills */}
                  <div className="flex gap-3 mt-6 pt-4 border-t border-slate-700">
                    <div className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center ${isCompleted ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                      <span className={`text-[9px] font-black uppercase ${isCompleted ? 'text-green-400' : 'text-blue-400'}`}>
                        {isCompleted ? 'Margem' : 'ROI Est.'}
                      </span>
                      <span className={`text-xl font-black ${isCompleted ? 'text-green-400' : 'text-blue-400'}`}>
                        {roi !== null ? `${(roi * 100).toFixed(1)}%` : '-'}
                      </span>
                    </div>

                    <div className={`flex-1 p-3 rounded-xl flex flex-col items-center justify-center ${isCompleted ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                      <span className={`text-[9px] font-black uppercase ${isCompleted ? 'text-green-400' : 'text-blue-400'}`}>
                        Mensal
                      </span>
                      <span className={`text-xl font-black ${isCompleted ? 'text-green-400' : 'text-blue-400'}`}>
                        {roiMensal !== null ? (
                          <div className="flex flex-col items-center justify-center gap-1">
                            {/* Real ROI */}
                            <span className="leading-none text-xl">{((roiMensal - inflationRate) * 100).toFixed(1)}%</span>

                            {/* Nominal & IPCA Row */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-bold">{(roiMensal * 100).toFixed(1)}%</span>
                              <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400/90 text-[8px] font-black rounded border border-red-500/20 leading-none whitespace-nowrap">
                                -{(inflationRate * 100).toFixed(1)}% IPCA
                              </span>
                            </div>
                          </div>
                        ) : '-'}
                      </span>
                    </div>
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
  onDeleteExpense: (id: string) => void
}> = ({ project, user, onAddExpense, onUpdate, logChange, onDeleteExpense }) => {
  const [showAdd, setShowAdd] = useState(false);
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
  const [projectSubMacros, setProjectSubMacros] = useState<ProjectSubMacro[]>([]);
  const [attachmentManagerId, setAttachmentManagerId] = useState<string | null>(null);
  const [tempDescription, setTempDescription] = useState('');

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

            // Buscar sub-macros
            const macroIds = macrosData.map(m => m.id);
            if (macroIds.length > 0) {
              const { data: subMacrosData } = await supabase
                .from('project_sub_macros')
                .select('*')
                .in('project_macro_id', macroIds)
                .order('display_order');

              if (subMacrosData) {
                setProjectSubMacros(subMacrosData.map(sm => ({
                  id: sm.id,
                  projectMacroId: sm.project_macro_id,
                  name: sm.name,
                  percentage: sm.percentage,
                  estimatedValue: sm.estimated_value,
                  spentValue: sm.spent_value || 0,
                  displayOrder: sm.display_order
                })));
              }
            }
          }
        }
      } catch (error) {
        console.error('Erro ao buscar macros:', error);
      }
    };
    fetchMacros();
  }, [project.id]);

  const isAdmin = user.role === UserRole.ADMIN;

  const handleEditExpense = (expId: string, updates: Partial<Expense>) => {
    if (!isAdmin) return;
    const oldExp = project.expenses.find(e => e.id === expId)!;
    const updatedExpenses = project.expenses.map(e => e.id === expId ? { ...e, ...updates } : e);

    // Se mudar a macro, limpar a sub-macro
    if (updates.hasOwnProperty('macroId')) {
      const expIndex = updatedExpenses.findIndex(e => e.id === expId);
      updatedExpenses[expIndex].subMacroId = undefined;
    }

    onUpdate(updatedExpenses);

    // Log individual changes
    Object.keys(updates).forEach(key => {
      const field = key as keyof Expense;
      if (field !== 'macroId' && field !== 'subMacroId' && field !== 'attachments') {
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
          <button onClick={() => setShowAdd(true)} className="bg-green-600 text-white px-6 py-3 rounded-full font-black text-sm hover:bg-green-700 transition shadow-lg shadow-green-600/30 flex items-center gap-2">
            <i className="fa-solid fa-plus"></i> Nova Despesa
          </button>
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
        onClose={() => setShowAdd(false)}
        onSave={(exp) => {
          onAddExpense(exp);
          setShowAdd(false);
        }}
        macros={projectMacros}
        subMacros={projectSubMacros}
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
                        <input
                          onFocus={(e) => e.target.select()}
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm font-bold text-white w-full outline-none"
                          value={tempDescription}
                          onChange={(e) => setTempDescription(e.target.value)}
                          onBlur={() => handleEditExpense(exp.id, { description: tempDescription })}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                      ) : (
                        <h5 className="font-black text-white text-lg">{exp.description}</h5>
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
                <th className="px-4 py-4">Categoria</th>
                <th className="px-4 py-4">Detalhe</th>
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
                            const [y, m, d] = exp.date.split('-');
                            return `${d}/${m}/${y}`;
                          })()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-bold text-white">
                      {isEditing ? (
                        <input
                          onFocus={(e) => e.target.select()}
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white w-full outline-none"
                          value={tempDescription}
                          onChange={(e) => setTempDescription(e.target.value)}
                          onBlur={() => handleEditExpense(exp.id, { description: tempDescription })}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                      ) : exp.description}
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

                    <td className="px-4 py-4">
                      {/* Coluna Detalhe (Sub-Macro) */}
                      {isEditing && exp.macroId && projectSubMacros.some(sm => sm.projectMacroId === exp.macroId) ? (
                        <select
                          className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs font-bold text-white w-full outline-none"
                          value={exp.subMacroId || ''}
                          onChange={(e) => handleEditExpense(exp.id, { subMacroId: e.target.value || undefined })}
                        >
                          <option value="">Sem detalhe</option>
                          {projectSubMacros
                            .filter(sm => sm.projectMacroId === exp.macroId)
                            .map(sm => (
                              <option key={sm.id} value={sm.id}>{sm.name}</option>
                            ))}
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">
                          {projectSubMacros.find(sm => sm.id === exp.subMacroId)?.name || <span className="text-slate-700 opacity-50">—</span>}
                        </span>
                      )}
                    </td>
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
const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, user, onUpdate, onDeleteUnit, onRefresh, onUpdateDiary, onDeleteDiary }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'units' | 'expenses' | 'budget' | 'documents' | 'diary'>('info');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [evidenceModal, setEvidenceModal] = useState<{ isOpen: boolean; stage: number; evidence?: any }>({ isOpen: false, stage: 0 });
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
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
    const oldName = STAGE_NAMES[project.progress];
    const newName = STAGE_NAMES[newStage];

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

  const handleAddUnit = async (unit: Omit<Unit, 'id'>): Promise<void> => {
    console.log('=== DEBUG: handleAddUnit chamado ===');
    console.log('Input unit:', unit);

    const newUnit: Unit = {
      ...unit,
      id: generateId(),
      status: 'Available',
      saleValue: undefined,
      saleDate: undefined
    };
    console.log('New unit with ID:', newUnit);

    const newUnits = [...project.units, newUnit];
    console.log('All units after add:', newUnits);

    // Persistir no banco e aguardar
    await onUpdate(project.id, {
      units: newUnits,
      expectedTotalCost: newUnits.reduce((a, b) => a + b.cost, 0),
      expectedTotalSales: newUnits.reduce((a, b) => a + (b.saleValue || b.valorEstimadoVenda || 0), 0)
    });

    // Log após confirmação do salvamento
    logChange('Inclusão', 'Unidade', '-', unit.identifier);
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

  const handleAddExpense = (exp: Omit<Expense, 'id' | 'userId' | 'userName'>) => {
    const newExpense = { ...exp, id: generateId(), userId: user.id, userName: user.login };
    onUpdate(project.id, { expenses: [...project.expenses, newExpense] });
    logChange('Inclusão', 'Despesa', '-', exp.description);
  };

  const handleEditExpense = (id: string, field: keyof Expense, value: any) => {
    const oldExpense = project.expenses.find(e => e.id === id);
    if (!oldExpense) return;

    const newExpenses = project.expenses.map(e => e.id === id ? { ...e, [field]: value } : e);
    onUpdate(project.id, { expenses: newExpenses });
    logChange('Alteração', `Despesa - ${field}`, String(oldExpense[field]), String(value));
  };

  const onDeleteExpense = (id: string) => {
    const expense = project.expenses.find(e => e.id === id);
    const newExpenses = project.expenses.filter(e => e.id !== id);
    onUpdate(project.id, { expenses: newExpenses });
    logChange('Exclusão', `Despesa - ${expense?.description || id}`, '-', '-');
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
    const doc = (project.documents || []).find(d => d.id === id);
    if (!doc) return;
    const newDocuments = (project.documents || []).filter(d => d.id !== id);
    onUpdate(project.id, { documents: newDocuments }, `Removido documento: ${doc.title}`);
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Container Principal - Dark Theme (Mobile: Flat / Desktop: Card) */}
      <div className="md:glass md:rounded-3xl md:p-8 space-y-6">
        {/* Navegação de Abas - Dark Theme */}
        {/* Navegação BENTO GRID - Redesign Premium */}
        {/* Navegação BENTO GRID - Redesign Premium "Chunky" */}
        {/* Navegação de Abas - Framed Tech Design */}
        <div className="mb-8 w-full px-4 md:px-0">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4">
            {/* 1. GESTÃO */}
            <button
              onClick={() => setActiveTab('info')}
              className={`h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'info'
                ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                }`}
            >
              <i className={`fa-solid fa-gauge-high text-2xl ${activeTab === 'info' ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'info' ? 'text-white' : 'text-slate-400'}`}>Gestão</span>
            </button>

            {/* 2. UNIDADES */}
            {canSeeUnits && (
              <button
                onClick={() => setActiveTab('units')}
                className={`h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'units'
                  ? 'bg-emerald-600/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                  }`}
              >
                <div className="relative">
                  <i className={`fa-solid fa-house-user text-2xl ${activeTab === 'units' ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`}></i>
                  <span className="absolute -top-2 -right-3 bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black">
                    {project.units.length}
                  </span>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'units' ? 'text-white' : 'text-slate-400'}`}>Unidades</span>
              </button>
            )}

            {/* 3. DESPESAS */}
            <button
              onClick={() => setActiveTab('expenses')}
              className={`h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'expenses'
                ? 'bg-rose-600/20 border-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                }`}
            >
              <i className={`fa-solid fa-wallet text-2xl ${activeTab === 'expenses' ? 'text-rose-400' : 'text-slate-500 group-hover:text-rose-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'expenses' ? 'text-white' : 'text-slate-400'}`}>Despesas</span>
            </button>

            {/* 4. ORÇAMENTO */}
            <button
              onClick={() => setActiveTab('budget')}
              className={`h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'budget'
                ? 'bg-purple-600/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                }`}
            >
              <i className={`fa-solid fa-chart-pie text-2xl ${activeTab === 'budget' ? 'text-purple-400' : 'text-slate-500 group-hover:text-purple-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'budget' ? 'text-white' : 'text-slate-400'}`}>Orçamento</span>
            </button>

            {/* 5. DOCUMENTOS */}
            <button
              onClick={() => setActiveTab('documents')}
              className={`h-24 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'documents'
                ? 'bg-amber-600/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                }`}
            >
              <i className={`fa-solid fa-folder-open text-2xl ${activeTab === 'documents' ? 'text-amber-400' : 'text-slate-500 group-hover:text-amber-400'}`}></i>
              <span className={`text-[10px] font-black uppercase tracking-widest ${activeTab === 'documents' ? 'text-white' : 'text-slate-400'}`}>Docs</span>
            </button>

            {/* 6. DIÁRIO */}
            <button
              onClick={() => setActiveTab('diary')}
              className={`h-24 lg:col-span-1 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-300 group ${activeTab === 'diary'
                ? 'bg-cyan-600/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'glass border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
                }`}
            >
              <i className={`fa-solid fa-book-open text-2xl ${activeTab === 'diary' ? 'text-cyan-400' : 'text-slate-500 group-hover:text-cyan-400'}`}></i>
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
                const currEvidence = project.stageEvidence?.find(e => e.stage === project.progress);
                setEvidenceModal({ isOpen: true, stage: project.progress, evidence: currEvidence });
              }}
              className="md:hidden glass rounded-3xl overflow-hidden relative aspect-video shadow-2xl border border-slate-700 w-full text-left group"
            >
              {(() => {
                const currEvidence = project.stageEvidence?.find(e => e.stage === project.progress);
                const photo = currEvidence?.photos?.[0];
                const stageName = STAGE_NAMES[project.progress];
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

            {/* Cards de Resumo - MOBILE GRID (2x2 Compact) */}
            <div className="grid grid-cols-2 gap-3 md:hidden mb-6">
              {/* 1. Vendidas */}
              <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <i className="fa-solid fa-handshake text-4xl"></i>
                </div>
                <p className="text-2xl font-black text-white">{soldUnits.length}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Vendidas</p>
              </div>

              {/* 2. Estoque */}
              <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <i className="fa-solid fa-boxes-stacked text-4xl"></i>
                </div>
                <p className="text-2xl font-black text-white">{availableUnits.length}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Estoque</p>
              </div>

              {/* 3. Receita */}
              <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <i className="fa-solid fa-sack-dollar text-4xl"></i>
                </div>
                <p className="text-lg font-black text-emerald-400">{formatCurrencyAbbrev(totalUnitsSales)}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Receita</p>
              </div>

              {/* 4. Potencial */}
              <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-2xl flex flex-col justify-center items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <i className="fa-solid fa-gem text-4xl"></i>
                </div>
                <p className="text-lg font-black text-blue-400">{formatCurrencyAbbrev(potentialSales)}</p>
                <p className="text-[10px] uppercase font-bold text-slate-500">Potencial</p>
              </div>
            </div>

            {/* Cards de Resumo - DESKTOP ORIGINAL */}
            <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* ... (existing cards) ... */}
            </div>



            {/* Cronograma de Obra - Opção Visual com Fotos */}
            <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700 overflow-x-auto">
              <div className="flex items-center justify-between mb-8 sticky left-0">
                <h3 className="font-black text-white text-xs md:text-sm uppercase tracking-widest flex items-center gap-2">
                  <i className="fa-solid fa-timeline text-blue-400"></i>
                  <span>Linha do Tempo</span>
                </h3>
                <div className="flex items-center gap-3">
                  {/* Investor Share Button */}
                  <button
                    onClick={() => {
                      const investorUrl = `${window.location.origin}${window.location.pathname}#/investor/${project.id}`;
                      navigator.clipboard.writeText(investorUrl);
                      alert('Link copiado!\n\n' + investorUrl);
                    }}
                    className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/40 text-blue-400 rounded-full text-xs font-bold hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                    title="Copiar link para investidor"
                  >
                    <i className="fa-solid fa-share-nodes"></i>
                    <span className="hidden md:inline">Compartilhar</span>
                  </button>

                  {/* PDF Export Button */}
                  <button
                    onClick={async () => {
                      if (isGeneratingPDF) return;
                      setIsGeneratingPDF(true);
                      try {
                        await generateProjectPDF(project, user.login || 'Usuário', inflationRate);
                      } catch (err) {
                        console.error('Error generating PDF', err);
                        alert('Erro ao gerar PDF. Tente novamente.');
                      } finally {
                        setIsGeneratingPDF(false);
                      }
                    }}
                    disabled={isGeneratingPDF}
                    className={`px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 rounded-full text-xs font-bold hover:bg-slate-700 hover:text-white transition-all flex items-center gap-2 ${isGeneratingPDF ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title="Baixar Relatório PDF"
                  >
                    {isGeneratingPDF ? (
                      <i className="fa-solid fa-spinner fa-spin text-red-400"></i>
                    ) : (
                      <i className="fa-solid fa-file-pdf text-red-400"></i>
                    )}
                    <span className="hidden md:inline">{isGeneratingPDF ? 'Gerando...' : 'PDF'}</span>
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
                  <div className="md:hidden text-[10px] text-slate-500 font-bold uppercase animate-pulse">
                    Deslize <i className="fa-solid fa-arrow-right ml-1"></i>
                  </div>
                </div>
              </div>

              {/* Stepper Visual Fotos */}
              <div className="relative py-4 min-w-[800px] px-10">
                {/* Linha de fundo */}
                <div className="absolute top-1/2 left-0 right-0 h-[4px] bg-slate-800 rounded-full -translate-y-1/2 z-0"></div>

                {/* Linha de progresso */}
                <div
                  className="absolute top-1/2 left-0 h-[4px] rounded-full -translate-y-1/2 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 z-0"
                  style={{ width: `${project.progress}%` }}
                ></div>

                {/* Dots com Fotos */}
                <div className="relative flex justify-between items-center z-10 w-full">
                  {PROGRESS_STAGES.map(stage => {
                    const isCompleted = project.progress >= stage;
                    const isCurrent = project.progress === stage;
                    const isPast = project.progress > stage;
                    const evidence = project.stageEvidence?.find(e => e.stage === stage);
                    const photo = evidence?.photos?.[0]; // Pega a primeira foto
                    const stageDate = evidence?.date ? new Date(evidence.date).toLocaleDateString('pt-BR') : null;

                    return (
                      <div key={stage} className="flex flex-col items-center gap-2 relative group">

                        {/* Tooltip com nome e data da etapa - aparece no hover (para todas etapas) */}
                        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-center font-bold px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-30 border border-slate-600 shadow-xl pointer-events-none">
                          <p className="text-[10px] uppercase tracking-wider">{STAGE_NAMES[stage]}</p>
                          {stageDate && (
                            <p className="text-[9px] text-blue-400 mt-0.5">
                              <i className="fa-solid fa-calendar-check mr-1"></i>{stageDate}
                            </p>
                          )}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                        </div>

                        <button
                          disabled={false}
                          onClick={() => {
                            if (isCurrent) {
                              // Current stage - open evidence modal for editing
                              setEvidenceModal({ isOpen: true, stage, evidence });
                            } else if (isPast) {
                              // Past stage - ask if want to go back or view evidence
                              const goBack = window.confirm(`Deseja voltar para a etapa "${STAGE_NAMES[stage]}"?\n\nClique "OK" para voltar, ou "Cancelar" para ver as fotos.`);
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
                            ? 'w-24 h-24 ring-4 ring-blue-500/40 border-blue-500 scale-110'
                            : isCompleted
                              ? 'w-12 h-12 border-blue-500/50 hover:border-blue-400 opacity-90'
                              : 'w-12 h-12 border-slate-700 bg-slate-800 opacity-50 grayscale'
                            }`}
                        >
                          {photo ? (
                            <StageThumbnail photoPath={photo} className="w-full h-full" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${isCompleted ? 'bg-slate-700' : 'bg-slate-800'}`}>
                              <i className={`fa-solid ${STAGE_ICONS[stage]} ${isCurrent ? 'text-blue-400 text-xl' : isCompleted ? 'text-blue-400 text-sm' : 'text-slate-600 text-sm'}`}></i>
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
                              {STAGE_NAMES[stage]}
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


            {/* Card SAÚDE FINANCEIRA - Restored & Refined */}
            <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700 overflow-hidden relative group">
              {/* Background Decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>

              <div className="flex flex-col md:flex-row gap-6 items-center relative z-10">
                {/* Left: Title & Progress */}
                <div className="flex-1 w-full">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-white text-xs md:text-sm uppercase tracking-widest flex items-center gap-2">
                      <i className="fa-solid fa-chart-pie text-blue-400"></i>
                      <span>Saúde Financeira</span>
                    </h3>
                    <div className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-2 ${budgetUsage > 100 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                      {budgetUsage > 100 && <i className="fa-solid fa-triangle-exclamation"></i>}
                      {budgetUsage.toFixed(1)}% <span className="opacity-70 text-[10px]">do Orçamento</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 relative overflow-hidden ${budgetUsage > 100 ? 'bg-gradient-to-r from-red-500 to-orange-600' : 'bg-gradient-to-r from-blue-500 to-cyan-400'}`}
                      style={{ width: `${Math.min(budgetUsage, 100)}%` }}
                    >
                      {/* Shine Effect */}
                      <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-b from-white/20 to-transparent"></div>
                    </div>
                  </div>

                  {/* Labels for Progress Bar */}
                  <div className="flex justify-between mt-2 text-[10px] uppercase font-bold text-slate-500">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Right: Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-4 w-full md:w-auto min-w-[300px]">
                  {/* Realizado */}
                  <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                    <p className="text-[9px] text-blue-400 font-black uppercase mb-1">Custo Realizado</p>
                    <p className="text-xl font-black text-white">{formatCurrency(totalActualExpenses)}</p>
                  </div>

                  {/* Vendas Estimadas (To match context, could trigger budget total instead) */}
                  <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                    <p className="text-[9px] text-slate-500 font-black uppercase mb-1">Custo Orçado</p>
                    <p className="text-xl font-black text-slate-300">
                      {totalUnitsCost > 0 ? formatCurrency(totalUnitsCost) : <span className="text-sm opacity-50">Não definido</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* NEW VENDAS & LUCRO DASHBOARD (Bento Format) */}
            <div className="glass rounded-3xl p-6 border border-slate-700/50 relative overflow-hidden group">
              {/* Background Glow Effects - Reduced Blur for Performance */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-xl -mr-32 -mt-32 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-xl -ml-32 -mb-32 pointer-events-none"></div>

              <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center shadow-lg text-blue-400">
                      <i className="fa-solid fa-sack-dollar"></i>
                    </span>
                    Vendas & Lucro
                  </h3>
                  <div className="px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold text-slate-400">
                    Dashboard Financeiro
                  </div>
                </div>

                {/* TOP ROW: Sales Gauge & Total Liquidated */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">

                  {/* 1. Unidades Vendidas (Gauge Style) - Col Span 2 */}
                  <div className="lg:col-span-2 bg-slate-800/40 rounded-2xl p-5 border border-slate-700/50 flex flex-col justify-between relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <i className="fa-solid fa-building text-6xl"></i>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Und. Vendidas</p>

                    <div className="flex items-center gap-6 mt-2">
                      {/* Circular Progress or Simple Stat */}
                      <div className="relative w-16 h-16 md:w-20 md:h-20 flex-shrink-0">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-700" />
                          <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={226} strokeDashoffset={226 - (226 * (soldUnits.length / (project.units.length || 1)))} className="text-blue-500" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center font-black text-white text-base md:text-lg">
                          {Math.round((soldUnits.length / (project.units.length || 1)) * 100)}%
                        </div>
                      </div>
                      <div>
                        <p className="text-3xl md:text-4xl font-black text-white leading-none mb-1">
                          {soldUnits.length}<span className="text-lg md:text-xl text-slate-500 font-bold">/{project.units.length}</span>
                        </p>
                        <p className="text-[10px] md:text-xs text-blue-400 font-bold uppercase mt-1">Metas</p>
                      </div>
                    </div>
                  </div>

                  {/* 2. Total Liquidado (Big Number) - Col Span 3 */}
                  <div className="lg:col-span-3 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-2xl p-6 border border-emerald-500/20 flex flex-col justify-center relative">
                    <div className="absolute top-4 right-4 w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 animate-pulse hidden md:flex">
                      <i className="fa-solid fa-coins"></i>
                    </div>
                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Total Liquidado</p>
                    <p className="text-3xl md:text-5xl font-black text-white tracking-tight">
                      {soldUnits.length > 0 ? formatCurrency(totalUnitsSales) : <span className="text-gray-500 text-lg uppercase">Não há vendas ainda</span>}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-[10px] md:text-xs text-slate-400 font-medium">
                      <i className="fa-solid fa-circle-check text-emerald-500"></i>
                      <span>Contratos validados</span>
                    </div>
                  </div>
                </div>

                {/* BOTTOM GRID: 4 Specs (Lucro Real, Estimado, Potencial, Margem) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                  {/* Lucro Real */}
                  <div className="bg-slate-800/40 rounded-2xl p-4 md:p-5 border border-blue-500/30 hover:border-blue-500/60 transition-colors group/card">
                    <div className="flex justify-between items-start mb-2 md:mb-3">
                      <div className="p-1.5 md:p-2 bg-blue-500/20 rounded-lg text-blue-400">
                        <i className="fa-solid fa-wallet"></i>
                      </div>
                      <span className="text-[10px] uppercase font-black bg-blue-500 text-white px-2 py-0.5 rounded">Real</span>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Lucro Real</p>
                    <p className="text-lg md:text-xl font-black text-white group-hover/card:text-blue-400 transition-colors">
                      {soldUnits.length > 0 ? formatCurrency(realProfit) : <span className="text-gray-500 uppercase md:text-base">Não há vendas ainda</span>}
                    </p>
                  </div>

                  {/* Lucro Estimado */}
                  <div className="bg-slate-800/40 rounded-2xl p-4 md:p-5 border border-cyan-500/30 hover:border-cyan-500/60 transition-colors group/card">
                    <div className="flex justify-between items-start mb-2 md:mb-3">
                      <div className="p-1.5 md:p-2 bg-cyan-500/20 rounded-lg text-cyan-400">
                        <i className="fa-solid fa-chart-line"></i>
                      </div>
                      <span className="text-[10px] uppercase font-black bg-cyan-600 text-white px-2 py-0.5 rounded">Est.</span>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Lucro Proj.</p>
                    <p className="text-lg md:text-xl font-black text-white group-hover/card:text-cyan-400 transition-colors">
                      {formatCurrency(estimatedGrossProfit)}
                    </p>
                  </div>

                  {/* Potencial / Vendido */}
                  <div className={`bg-slate-800/40 rounded-2xl p-4 md:p-5 border transition-colors group/card ${potentialSales === 0 ? 'bg-orange-500/10 border-orange-500/50' : 'border-orange-500/30 hover:border-orange-500/60'}`}>
                    <div className="flex justify-between items-start mb-2 md:mb-3">
                      <div className="p-1.5 md:p-2 bg-orange-500/20 rounded-lg text-orange-400">
                        <i className="fa-solid fa-gem"></i>
                      </div>
                      <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded ${potentialSales === 0 ? 'bg-orange-600 text-white animate-pulse' : 'bg-orange-500/20 text-orange-400'}`}>
                        {potentialSales === 0 ? 'Esgotado' : 'Pot.'}
                      </span>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Potencial</p>
                    {potentialSales === 0 ? (
                      <p className="text-lg md:text-xl font-black text-orange-500 tracking-wider">VENDIDO</p>
                    ) : (
                      <p className="text-lg md:text-xl font-black text-white group-hover/card:text-orange-400 transition-colors">
                        {formatCurrency(potentialSales)}
                      </p>
                    )}
                  </div>

                  {/* Margens (Combined) */}
                  <div className="bg-slate-800/40 rounded-2xl p-4 md:p-5 border border-purple-500/30 hover:border-purple-500/60 transition-colors group/card">
                    <div className="flex justify-between items-start mb-2 md:mb-3">
                      <div className="p-1.5 md:p-2 bg-purple-500/20 rounded-lg text-purple-400">
                        <i className="fa-solid fa-percent"></i>
                      </div>
                      <span className="text-[10px] uppercase font-black bg-purple-600 text-white px-2 py-0.5 rounded">Margem</span>
                    </div>
                    {soldUnits.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex flex-col">
                          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Margem Média</p>
                          <p className="text-lg md:text-2xl font-black text-white group-hover/card:text-purple-400 transition-colors leading-none">
                            {(!isNaN(margins.avgRoi) ? margins.avgRoi : 0).toFixed(0)}%
                          </p>
                        </div>
                        <div className="pt-3 border-t border-slate-700/50 flex flex-col">
                          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Mensal</p>
                          <div className="flex items-center gap-2">
                            <span className="text-lg md:text-2xl font-black text-white leading-none">
                              {((!isNaN(margins.avgMonthlyRoi) ? margins.avgMonthlyRoi : 0) - (inflationRate * 100)).toFixed(1)}%
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400/90 text-[8px] font-black rounded border border-red-500/20 leading-none whitespace-nowrap">
                                -{(inflationRate * 100).toFixed(1)}% IPCA
                              </span>
                              <span className="text-[8px] text-slate-500 font-bold leading-none ml-0.5">
                                Ref. {(!isNaN(margins.avgMonthlyRoi) ? margins.avgMonthlyRoi : 0).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase mb-1">Margem Média</p>
                        <p className="text-lg md:text-base font-black text-gray-500 uppercase tracking-tight">Não há vendas ainda</p>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== ABA UNIDADES ===== */}
        {activeTab === 'units' && (
          <div className="animate-fade-in">
            <UnitsSection
              project={project}
              user={user}
              onAddUnit={handleAddUnit}
              onUpdateUnit={handleUpdateUnit}
              onDeleteUnit={onDeleteUnit}
              logChange={logChange}
            />
          </div>
        )}

        {/* ===== ABA DESPESAS ===== */}
        {activeTab === 'expenses' && (
          <div className="animate-fade-in">
            <ExpensesSection
              project={project}
              user={user}
              onAddExpense={handleAddExpense}
              onUpdate={(expenses) => onUpdate(project.id, { expenses })}
              logChange={logChange}
              onDeleteExpense={onDeleteExpense}
            />
          </div>
        )}

        {/* ===== ABA ORÇAMENTO (MACRO-DESPESAS) ===== */}
        {activeTab === 'budget' && (
          <div className="animate-fade-in">
            <BudgetSection
              project={project}
              isAdmin={isAdmin}
              onBudgetUpdate={onRefresh}
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

        {/* ===== ABA DIÁRIO ===== */}
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
        evidence={evidenceModal.evidence}
        onSave={handleSaveEvidence}
      />

      {showSchedule && (
        <ScheduleView
          project={project}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
};

export default ProjectDetail;
