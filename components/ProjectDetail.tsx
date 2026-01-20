
import React, { useState, useMemo } from 'react';
import { Project, User, UserRole, ProgressStage, STAGE_NAMES, STAGE_ICONS, STAGE_ABBREV, Unit, Expense } from '../types';
import { PROGRESS_STAGES } from '../constants';
import { formatCurrency, formatCurrencyAbbrev, generateId, calculateMonthsBetween } from '../utils';

interface ProjectDetailProps {
  project: Project;
  user: User;
  onUpdate: (id: string, updates: Partial<Project>, logMsg?: string) => Promise<void>;
  onDeleteUnit: (projectId: string, unitId: string) => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, user, onUpdate, onDeleteUnit }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'units' | 'expenses' | 'logs'>('info');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);

  const isAdmin = user.role === UserRole.ADMIN;
  const canSeeUnits = user.canSeeUnits || isAdmin;

  // Cálculos defensivos para dados antigos
  const totalActualExpenses = project.expenses.reduce((acc, curr) => acc + curr.value, 0);
  const totalUnitsCost = project.units.reduce((acc, curr) => acc + curr.cost, 0);
  const totalUnitsSales = project.units.reduce((acc, curr) => acc + (curr.saleValue || 0), 0);

  // Nova Lógica Financeira (valorEstimadoVenda)
  const totalEstimatedSales = project.units.reduce((acc, curr) => acc + (curr.valorEstimadoVenda || 0), 0);
  const estimatedGrossProfit = totalEstimatedSales - totalUnitsCost;

  // ROI Indicadores (Mantidos no código)
  const roiUnits = totalUnitsCost > 0 ? (totalEstimatedSales - totalUnitsCost) / totalUnitsCost : 0;

  const firstExpense = project.expenses.length > 0
    ? project.expenses.reduce((min, e) => e.date < min.date ? e : min, project.expenses[0])
    : null;

  const monthsSinceFirstExpense = firstExpense
    ? calculateMonthsBetween(firstExpense.date, new Date().toISOString().split('T')[0])
    : 1;

  const averageMonthlyROI = roiUnits / (monthsSinceFirstExpense || 1);

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
    onUpdate(project.id, { progress: newStage }, `Progresso: ${oldName} -> ${newName}`);
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Container Principal - Dark Theme */}
      <div className="glass rounded-3xl p-8">
        {/* Navegação de Abas - Dark Theme */}
        <div className="flex flex-wrap gap-3 mb-10 w-full justify-center">
          {['info', 'units', 'expenses', 'logs'].map((tab) => {
            if (tab === 'units' && !canSeeUnits) return null;

            const labels: Record<string, string> = {
              info: 'Gestão',
              units: 'Unidades',
              expenses: 'Despesas',
              logs: 'Auditoria'
            };

            const icons: Record<string, string> = {
              info: 'fa-gauge-high',
              units: 'fa-house-user',
              expenses: 'fa-wallet',
              logs: 'fa-fingerprint'
            };

            const isActive = activeTab === tab;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all duration-300 ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white'
                  }`}
              >
                <i className={`fa-solid ${icons[tab]} mr-2`}></i> {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* ===== ABA GESTÃO - Redesign Premium ===== */}
        {activeTab === 'info' && (
          <div className="animate-fade-in space-y-8">
            {/* Cronograma de Obra - Opção F: Stepper Dots */}
            <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-white text-xs md:text-sm uppercase tracking-widest flex items-center gap-2">
                  <i className="fa-solid fa-timeline text-blue-400"></i>
                  <span className="hidden sm:inline">Cronograma</span>
                  <span className="sm:hidden">Progresso</span>
                </h3>
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1.5 rounded-full font-black text-[10px] shadow-lg">
                  {project.progress}%
                </div>
              </div>

              {/* Etapa Atual em Destaque */}
              {(() => {
                const currentStage = project.progress;
                const currentStageName = STAGE_NAMES[currentStage] || 'Planejamento';
                const isCompleted = currentStage === 100;
                const nextStages = PROGRESS_STAGES.filter(s => s > currentStage);

                return (
                  <div className="text-center mb-4">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">
                      {isCompleted ? '🏆 OBRA CONCLUÍDA' : '🔨 ETAPA ATUAL'}
                    </div>
                    <div className={`text-lg md:text-xl font-black ${isCompleted ? 'text-green-400' : 'text-blue-400'}`}>
                      {currentStageName}
                    </div>
                    {!isCompleted && nextStages.length > 0 && (
                      <div className="text-[10px] text-orange-400 mt-1">
                        Falta: {nextStages.slice(0, 2).map(s => STAGE_NAMES[s].split(' ')[0]).join(', ')}
                        {nextStages.length > 2 && ` +${nextStages.length - 2}`}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Stepper Dots */}
              <div className="relative py-3">
                {/* Linha de fundo */}
                <div className="absolute top-1/2 left-0 right-0 h-[3px] bg-slate-700 rounded-full -translate-y-1/2"></div>
                {/* Linha de progresso */}
                <div
                  className="absolute top-1/2 left-0 h-[3px] rounded-full -translate-y-1/2 bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${project.progress}%` }}
                ></div>

                {/* Dots */}
                <div className="relative flex justify-between">
                  {PROGRESS_STAGES.map(stage => {
                    const isCompleted = project.progress >= stage;
                    const isCurrent = project.progress === stage;

                    return (
                      <button
                        key={stage}
                        disabled={!isAdmin && stage < project.progress}
                        onClick={() => handleStageChange(stage)}
                        className="group"
                        title={STAGE_NAMES[stage]}
                      >
                        <div className={`w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center transition-all ${isCompleted
                          ? isCurrent
                            ? 'bg-orange-500 ring-2 ring-orange-400/50 scale-125'
                            : 'bg-gradient-to-br from-blue-500 to-purple-500'
                          : 'bg-slate-700 border border-slate-600'
                          } group-hover:scale-110`}>
                          {isCompleted && !isCurrent && (
                            <i className="fa-solid fa-check text-white text-[6px] md:text-[8px]"></i>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cards Grid - Design Premium */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Card SAÚDE FINANCEIRA - Opção B: Barra Horizontal */}
              <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-black text-white uppercase text-xs md:text-sm tracking-widest flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-chart-pie text-blue-400 text-sm"></i>
                    </div>
                    <span className="hidden sm:inline">Saúde Financeira</span>
                    <span className="sm:hidden">Financeiro</span>
                  </h4>
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${budgetUsage > 100 ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                    {budgetUsage.toFixed(0)}%
                  </span>
                </div>

                {/* Barra de Progresso Horizontal */}
                <div className="h-2 bg-slate-700 rounded-full mb-4 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${budgetUsage > 100 ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                    style={{ width: `${Math.min(budgetUsage, 100)}%` }}
                  ></div>
                </div>

                {/* Valores em Grid */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[9px] md:text-[10px] text-blue-400 font-bold uppercase">Realizado</p>
                    <p className="text-xl md:text-2xl font-black text-white">{formatCurrency(totalActualExpenses)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase">Orçamento Total</p>
                    <p className="text-base md:text-lg font-bold text-slate-300">{formatCurrency(totalUnitsCost)}</p>
                  </div>
                  <div className={`flex items-center gap-2 text-xs md:text-sm ${totalUnitsCost - totalActualExpenses >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${totalUnitsCost - totalActualExpenses >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    <span>Saldo: <strong>{formatCurrency(totalUnitsCost - totalActualExpenses)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Card VENDAS - Opção A: Grid Compacto */}
              <div className="rounded-2xl p-4 md:p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 50%, #2dd4bf 100%)' }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>

                <div className="flex items-center justify-between mb-4 relative z-10">
                  <h4 className="font-black text-white uppercase text-xs md:text-sm tracking-widest flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 bg-white/20 rounded-lg flex items-center justify-center">
                      <i className="fa-solid fa-chart-line text-white text-sm"></i>
                    </div>
                    Vendas
                  </h4>
                  {(() => {
                    const soldUnits = project.units.filter(u => u.status === 'Sold').length;
                    const totalUnits = project.units.length;
                    const salesPercent = totalUnits > 0 ? (soldUnits / totalUnits) * 100 : 0;
                    return (
                      <span className="px-3 py-1 rounded-full text-xs font-black bg-white/20 text-white">
                        {salesPercent.toFixed(0)}% Meta
                      </span>
                    );
                  })()}
                </div>

                <div className="relative z-10 space-y-3">
                  {/* Grid 2x2 com números grandes */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/15 backdrop-blur-sm p-3 rounded-xl border border-white/20 text-center">
                      <p className="text-[9px] md:text-[10px] text-white/70 font-bold uppercase">✅ Vendidas</p>
                      <p className="text-3xl md:text-4xl font-black text-white">{project.units.filter(u => u.status === 'Sold').length}</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur-sm p-3 rounded-xl border border-white/20 text-center">
                      <p className="text-[9px] md:text-[10px] text-white/70 font-bold uppercase">🏷️ À Venda</p>
                      <p className="text-3xl md:text-4xl font-black text-white">{project.units.filter(u => u.status === 'Available').length}</p>
                    </div>
                  </div>
                  {/* Total Vendido */}
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl border border-white/30 text-center">
                    <p className="text-[9px] md:text-[10px] text-white/70 font-bold uppercase">💰 Total Vendido</p>
                    <p className="text-lg md:text-xl font-black text-white">{formatCurrency(totalUnitsSales)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Linha de Métricas Complementares */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
              {/* Margem Média */}
              <div className="glass rounded-xl p-3 md:p-4 border border-green-500/30 bg-green-500/5">
                <div className="text-center md:text-left">
                  <p className="text-[8px] md:text-[9px] text-green-400 font-bold uppercase mb-1">📈 Margem</p>
                  <p className="text-xl md:text-2xl font-black text-green-400">
                    {(() => {
                      const isCompleted = project.progress === 100;
                      const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);
                      const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);
                      let totalRoi = 0, soldCount = 0;
                      project.units.forEach(unit => {
                        if (unit.status === 'Sold' && unit.saleValue && unit.saleValue > 0) {
                          const realCost = (isCompleted && totalUnitsArea > 0) ? (unit.area / totalUnitsArea) * totalExpenses : unit.cost;
                          const costBase = realCost > 0 ? realCost : unit.cost;
                          if (costBase > 0) { totalRoi += (unit.saleValue - costBase) / costBase; soldCount++; }
                        }
                      });
                      return `${(soldCount > 0 ? (totalRoi / soldCount) * 100 : 0).toFixed(1)}%`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Margem Mensal */}
              <div className="glass rounded-xl p-3 md:p-4 border border-purple-500/30 bg-purple-500/5">
                <div className="text-center md:text-left">
                  <p className="text-[8px] md:text-[9px] text-purple-400 font-bold uppercase mb-1">📅 Mensal</p>
                  <p className="text-xl md:text-2xl font-black text-purple-400">
                    {(() => {
                      const isCompleted = project.progress === 100;
                      const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);
                      const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);
                      const firstExpenseDate = project.expenses.length > 0 ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date) : null;
                      let totalMonthlyRoi = 0, soldCount = 0;
                      project.units.forEach(unit => {
                        if (unit.status === 'Sold' && unit.saleValue && unit.saleValue > 0) {
                          const realCost = (isCompleted && totalUnitsArea > 0) ? (unit.area / totalUnitsArea) * totalExpenses : unit.cost;
                          const costBase = realCost > 0 ? realCost : unit.cost;
                          if (costBase > 0) {
                            const roi = (unit.saleValue - costBase) / costBase;
                            const months = (unit.saleDate && firstExpenseDate) ? calculateMonthsBetween(firstExpenseDate, unit.saleDate) : null;
                            const roiMensal = (months !== null && months > 0) ? roi / months : 0;
                            totalMonthlyRoi += roiMensal; soldCount++;
                          }
                        }
                      });
                      return `${(soldCount > 0 ? (totalMonthlyRoi / soldCount) * 100 : 0).toFixed(1)}%`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Potencial de Venda */}
              <div className="glass rounded-xl p-3 md:p-4 border border-orange-500/30 bg-orange-500/5">
                <div className="text-center md:text-left">
                  <p className="text-[8px] md:text-[9px] text-orange-400 font-bold uppercase mb-1">💎 Potencial</p>
                  <p className="text-lg md:text-xl font-black text-orange-400">
                    <span className="md:hidden">{formatCurrencyAbbrev(project.units.filter(u => u.status === 'Available').reduce((sum, u) => sum + (u.valorEstimadoVenda || 0), 0))}</span>
                    <span className="hidden md:inline">{formatCurrency(project.units.filter(u => u.status === 'Available').reduce((sum, u) => sum + (u.valorEstimadoVenda || 0), 0))}</span>
                  </p>
                </div>
              </div>

              {/* Lucro Estimado */}
              <div className="glass rounded-xl p-3 md:p-4 border border-cyan-500/30 bg-cyan-500/5">
                <div className="text-center md:text-left">
                  <p className="text-[8px] md:text-[9px] text-cyan-400 font-bold uppercase mb-1">💰 Lucro</p>
                  <p className="text-lg md:text-xl font-black text-cyan-400">
                    <span className="md:hidden">{formatCurrencyAbbrev(estimatedGrossProfit)}</span>
                    <span className="hidden md:inline">{formatCurrency(estimatedGrossProfit)}</span>
                  </p>
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
            />
          </div>
        )}

        {/* ===== ABA AUDITORIA - Timeline Design ===== */}
        {activeTab === 'logs' && (
          <div className="space-y-6 animate-fade-in">
            {(!project.logs || project.logs.length === 0) ? (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <i className="fa-solid fa-fingerprint text-3xl text-slate-600"></i>
                </div>
                <p className="text-slate-500 font-bold">Nenhum registro de atividade encontrado.</p>
              </div>
            ) : (
              <div className="glass rounded-2xl p-4 md:p-6 border border-slate-700">
                <h3 className="font-black text-white text-sm uppercase tracking-widest mb-6 flex items-center gap-2">
                  <i className="fa-solid fa-list-ul text-blue-400"></i>
                  Histórico de Alterações
                </h3>

                <div className="relative border-l-2 border-slate-700 ml-3 md:ml-6 space-y-8">
                  {project.logs.length > 0 && [...project.logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((log, index) => (
                    <div key={log.id || index} className="relative pl-6 md:pl-8 group">
                      {/* Timestamp Dot */}
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 group-hover:scale-125 transition-transform flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                      </div>

                      {/* Content Card */}
                      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-blue-500/30 transition-all">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-[10px] uppercase font-black tracking-widest ${log.action === 'Criação' ? 'bg-green-500/20 text-green-400' :
                              log.action === 'Inclusão' ? 'bg-green-500/20 text-green-400' :
                                log.action === 'Exclusão' ? 'bg-red-500/20 text-red-400' :
                                  'bg-blue-500/20 text-blue-400'
                              }`}>
                              {log.action}
                            </span>
                            <span className="text-xs font-bold text-slate-400">
                              {new Date(log.timestamp).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-400">
                              {(log.userName && log.userName[0]) ? log.userName[0].toUpperCase() : '-'}
                            </div>
                            <span className="text-xs text-slate-500 font-bold">{log.userName}</span>
                          </div>
                        </div>

                        <div className="text-sm font-bold text-white mb-2">
                          {log.field === '-' ? (
                            <span>Realizou uma ação de <span className="text-blue-400">{log.action}</span></span>
                          ) : (
                            <span>Alterou <span className="text-blue-400">{log.field}</span></span>
                          )}
                        </div>

                        {log.oldValue !== '-' && log.newValue !== '-' && (
                          <div className="flex items-center gap-3 text-xs bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                            <div className="flex-1 min-w-0">
                              <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">De:</div>
                              <div className="text-red-400 font-mono truncate" title={log.oldValue}>{log.oldValue}</div>
                            </div>
                            <i className="fa-solid fa-arrow-right text-slate-600"></i>
                            <div className="flex-1 min-w-0">
                              <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Para:</div>
                              <div className="text-green-400 font-mono truncate" title={log.newValue}>{log.newValue}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Sub-sections ---

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

      {/* Formulário Nova Unidade - Dark Theme */}
      {showAdd && (
        <form
          className="p-6 glass border border-slate-700 rounded-2xl grid grid-cols-1 md:grid-cols-5 gap-4 animate-fade-in"
          onSubmit={handleSubmitNewUnit}
        >
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Identificador</label>
            <input required className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white placeholder-slate-500" placeholder="Ex: Casa 01" value={formData.identifier} onChange={e => setFormData({ ...formData, identifier: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Área (m²)</label>
            <input required type="number" className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white" value={formData.area} onChange={e => setFormData({ ...formData, area: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Custo (R$)</label>
            <input required type="number" className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white" value={formData.cost} onChange={e => setFormData({ ...formData, cost: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-400 uppercase ml-3">Est. Venda</label>
            <input required type="number" className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white" value={formData.valorEstimadoVenda} onChange={e => setFormData({ ...formData, valorEstimadoVenda: Number(e.target.value) })} />
          </div>
          <div className="flex gap-2 mt-auto">
            <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 shadow-lg shadow-blue-600/30">
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="w-12 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:text-red-400 hover:border-red-400 transition"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </form>
      )}

      {/* Grid de Cards de Unidades - Dark Theme */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            <div key={unit.id} className={`glass rounded-2xl p-6 border transition-all hover:shadow-xl ${isEditing ? 'border-orange-500' : 'border-slate-700 hover:border-blue-500/50'}`}>
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h5 className="font-black text-white text-lg">{unit.identifier}</h5>
                    <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${unit.status === 'Sold' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                      {unit.status === 'Sold' ? 'Vendida' : 'À Venda'}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">{unit.area} m² de área</p>
                </div>

                <div className="flex items-center gap-2">
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
                        onClick={() => setEditingUnitId(unit.id)}
                        className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition border border-slate-700"
                        title="Editar"
                      >
                        <i className="fa-solid fa-pen-to-square text-sm"></i>
                      </button>
                      <button
                        onClick={() => onDeleteUnit(project.id, unit.id)}
                        className="w-9 h-9 flex items-center justify-center bg-slate-800 text-slate-400 rounded-lg hover:bg-red-600 hover:text-white transition border border-slate-700"
                        title="Excluir"
                      >
                        <i className="fa-solid fa-trash text-sm"></i>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Métricas */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                  <span className="text-slate-500 font-bold text-[10px] uppercase">Custo Estimado</span>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-28 bg-slate-700 p-2 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-blue-500"
                      defaultValue={unit.cost}
                      onBlur={(e) => handleUpdateUnit(unit.id, { cost: Number(e.target.value) })}
                    />
                  ) : (
                    <span className="font-bold text-white">{formatCurrency(unit.cost)}</span>
                  )}
                </div>

                <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl border border-slate-700">
                  <span className="text-blue-400 font-bold text-[10px] uppercase">Venda Estimada</span>
                  {isEditing ? (
                    <input
                      type="number"
                      className="w-28 bg-slate-700 p-2 border border-slate-600 rounded-lg text-right font-bold text-white text-sm outline-none focus:border-blue-500"
                      defaultValue={unit.valorEstimadoVenda || 0}
                      onBlur={(e) => handleUpdateUnit(unit.id, { valorEstimadoVenda: Number(e.target.value) })}
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
                    <input
                      type="number"
                      disabled={!isEditing}
                      className={`w-full p-3 rounded-lg text-sm font-bold outline-none transition ${isEditing
                        ? 'bg-slate-700 border border-slate-600 text-white focus:border-blue-500'
                        : 'bg-transparent text-white cursor-default border-none'
                        }`}
                      placeholder="R$ 0,00"
                      defaultValue={unit.saleValue}
                      onBlur={(e) => handleUpdateUnit(unit.id, { saleValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                    <label className="text-[9px] font-black text-slate-500 uppercase mb-2 block">Data da Venda</label>
                    <input
                      type="date"
                      disabled={!isEditing}
                      className={`w-full p-3 rounded-lg text-sm font-bold outline-none transition ${isEditing
                        ? 'bg-slate-700 border border-slate-600 text-white focus:border-blue-500'
                        : 'bg-transparent text-slate-400 cursor-default border-none'
                        }`}
                      defaultValue={unit.saleDate}
                      onBlur={(e) => handleUpdateUnit(unit.id, { saleDate: e.target.value === "" ? undefined : e.target.value })}
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
                    {roiMensal !== null ? `${(roiMensal * 100).toFixed(1)}%` : '-'}
                  </span>
                </div>
              </div>
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
  logChange: (a: string, f: string, o: string, n: string) => void
}> = ({ project, user, onAddExpense, onUpdate, logChange }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    value: 0,
    date: new Date().toISOString().split('T')[0]
  });

  const isAdmin = user.role === UserRole.ADMIN;

  const handleEditExpense = (expId: string, field: 'value' | 'date', newVal: any) => {
    if (!isAdmin) return;
    const oldExp = project.expenses.find(e => e.id === expId)!;
    const oldVal = String(oldExp[field]);
    const updatedExpenses = project.expenses.map(e => e.id === expId ? { ...e, [field]: newVal } : e);
    onUpdate(updatedExpenses);
    logChange('Alteração', `Despesa ${oldExp.description} - ${field}`, oldVal, String(newVal));
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="font-black text-white text-lg uppercase tracking-tight flex items-center gap-3">
          <i className="fa-solid fa-wallet text-green-400"></i>
          Fluxo de Despesas
        </h3>
        <button onClick={() => setShowAdd(true)} className="bg-green-600 text-white px-6 py-3 rounded-full font-black text-sm hover:bg-green-700 transition shadow-lg shadow-green-600/30 flex items-center gap-2">
          <i className="fa-solid fa-plus"></i> Nova Despesa
        </button>
      </div>

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

      {/* Formulário Nova Despesa */}
      {showAdd && (
        <form className="p-6 glass border border-slate-700 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in" onSubmit={(e) => { e.preventDefault(); onAddExpense(formData); setShowAdd(false); }}>
          <div className="md:col-span-1 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Descrição</label>
            <input required className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white placeholder-slate-500" placeholder="Ex: Cimento, Pintor..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Valor (R$)</label>
            <input required type="number" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white" value={formData.value} onChange={e => setFormData({ ...formData, value: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-3">Data</label>
            <input required type="date" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold outline-none focus:border-blue-500 text-white" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
          </div>
          <div className="flex gap-2 mt-auto">
            <button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-600/30">Salvar</button>
            <button type="button" onClick={() => setShowAdd(false)} className="w-12 bg-slate-800 text-slate-400 rounded-xl border border-slate-700 hover:text-red-400 transition"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </form>
      )}

      {/* Lista de Despesas - Responsive */}
      <div className="space-y-4">
        {/* Mobile: Lista de Cards */}
        <div className="md:hidden space-y-3">
          {project.expenses.map((exp) => (
            <div key={exp.id} className="glass p-4 rounded-xl border border-slate-700 relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Data</div>
                  {isAdmin ? (
                    <input
                      type="date"
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                      defaultValue={exp.date}
                      onBlur={(e) => handleEditExpense(exp.id, 'date', e.target.value)}
                    />
                  ) : (
                    <div className="text-sm font-bold text-slate-300">{new Date(exp.date).toLocaleDateString('pt-BR')}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Valor</div>
                  {isAdmin ? (
                    <input
                      type="number"
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white text-right w-24 outline-none focus:border-blue-500"
                      defaultValue={exp.value}
                      onBlur={(e) => handleEditExpense(exp.id, 'value', Number(e.target.value))}
                    />
                  ) : (
                    <div className="text-lg font-black text-green-400">{formatCurrency(exp.value)}</div>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Descrição</div>
                <div className="text-base font-bold text-white">{exp.description}</div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-400 border border-slate-600">
                  {(exp.userName && exp.userName[0]) ? exp.userName[0].toUpperCase() : '-'}
                </div>
                <div className="text-xs text-slate-400 font-bold">{exp.userName || 'Sistema'}</div>
                {isAdmin && (
                  <button onClick={() => onDeleteExpense(exp.id)} className="ml-auto text-red-400 hover:text-red-300 text-xs uppercase font-bold px-2 py-1 bg-red-400/10 rounded-lg">Excluir</button>
                )}
              </div>
            </div>
          ))}
          {project.expenses.length === 0 && (
            <div className="text-center py-10 text-slate-500">Nenhuma despesa registrada.</div>
          )}
        </div>

        {/* Desktop: Tabela Tradicional */}
        <div className="hidden md:block glass rounded-2xl border border-slate-700 overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-800 border-b border-slate-700 text-slate-400 font-black uppercase text-[10px] tracking-widest">
              <tr>
                <th className="px-6 py-4">Data</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4">Autor</th>
                <th className="px-6 py-4 text-right">Valor</th>
                {isAdmin && <th className="px-6 py-4 text-center">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {project.expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-800/50 transition">
                  <td className="px-6 py-4">
                    {isAdmin ? (
                      <input
                        type="date"
                        className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-xs outline-none focus:border-blue-500 font-bold text-white"
                        defaultValue={exp.date}
                        onBlur={(e) => handleEditExpense(exp.id, 'date', e.target.value)}
                      />
                    ) : (
                      <span className="font-bold text-slate-300">{new Date(exp.date).toLocaleDateString('pt-BR')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-bold text-white">{exp.description}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-600">
                        {(exp.userName && exp.userName[0]) ? exp.userName[0].toUpperCase() : '-'}
                      </div>
                      <span className="text-slate-400 font-bold">{exp.userName || 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isAdmin ? (
                      <input
                        type="number"
                        className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-right w-28 outline-none focus:border-blue-500 font-bold text-green-400"
                        defaultValue={exp.value}
                        onBlur={(e) => handleEditExpense(exp.id, 'value', Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-bold text-green-400">{formatCurrency(exp.value)}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => onDeleteExpense(exp.id)} className="w-8 h-8 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 transition flex items-center justify-center">
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
