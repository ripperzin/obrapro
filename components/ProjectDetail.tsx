
import React, { useState, useMemo } from 'react';
import { Project, User, UserRole, ProgressStage, STAGE_NAMES, Unit, Expense } from '../types';
import { PROGRESS_STAGES } from '../constants';
import { formatCurrency, generateId, calculateMonthsBetween } from '../utils';

interface ProjectDetailProps {
  project: Project;
  user: User;
  onUpdate: (id: string, updates: Partial<Project>, logMsg?: string) => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, user, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'units' | 'expenses' | 'logs'>('info');

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

  const handleAddUnit = (unit: Omit<Unit, 'id'>) => {
    const newUnit = { ...unit, id: generateId() };
    const newUnits = [...project.units, newUnit];

    onUpdate(project.id, {
      units: newUnits,
      expectedTotalCost: newUnits.reduce((a, b) => a + b.cost, 0),
      expectedTotalSales: newUnits.reduce((a, b) => a + (b.saleValue || b.valorEstimadoVenda || 0), 0)
    });
    logChange('Inclusão', 'Unidade', '-', unit.identifier);
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
        <div className="flex flex-wrap gap-3 mb-10 p-1.5 bg-slate-50 rounded-[2rem] w-fit">
          <button onClick={() => setActiveTab('info')} className={`px-8 py-3.5 rounded-full font-black text-sm transition-all ${activeTab === 'info' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>
            <i className="fa-solid fa-gauge-high mr-2"></i> Gestão
          </button>
          {canSeeUnits && (
            <button onClick={() => setActiveTab('units')} className={`px-8 py-3.5 rounded-full font-black text-sm transition-all ${activeTab === 'units' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>
              <i className="fa-solid fa-house-user mr-2"></i> Unidades
            </button>
          )}
          <button onClick={() => setActiveTab('expenses')} className={`px-8 py-3.5 rounded-full font-black text-sm transition-all ${activeTab === 'expenses' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>
            <i className="fa-solid fa-wallet mr-2"></i> Despesas
          </button>
          <button onClick={() => setActiveTab('logs')} className={`px-8 py-3.5 rounded-full font-black text-sm transition-all ${activeTab === 'logs' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>
            <i className="fa-solid fa-fingerprint mr-2"></i> Auditoria
          </button>
        </div>

        {activeTab === 'info' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            <div className="space-y-6">
              <div className="flex justify-between items-center px-2">
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">Cronograma de Obra</h3>
                <span className="bg-blue-600 text-white px-5 py-2 rounded-full font-black text-xs shadow-lg shadow-blue-100">{project.progress}%</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 gap-2">
                {PROGRESS_STAGES.map(stage => (
                  <button
                    key={stage}
                    disabled={!isAdmin && stage < project.progress}
                    onClick={() => handleStageChange(stage)}
                    className={`flex flex-col items-center p-4 rounded-[1.5rem] border-2 transition-all ${project.progress === stage
                      ? 'bg-blue-600 border-blue-600 text-white scale-105 shadow-xl shadow-blue-100'
                      : project.progress > stage
                        ? 'bg-blue-50 border-blue-100 text-blue-600 opacity-60'
                        : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200'
                      }`}
                  >
                    <span className="text-[10px] font-black uppercase mb-1">{stage}%</span>
                    <div className="w-2 h-2 rounded-full bg-current mb-2"></div>
                    <span className="text-[9px] font-bold text-center leading-tight">{STAGE_NAMES[stage]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100">
                <h4 className="font-black text-slate-800 mb-6 uppercase text-sm tracking-widest">Saúde Financeira</h4>
                <div className="space-y-6">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-slate-500">Orçamento vs Realizado</span>
                    <span className={budgetUsage > 90 ? 'text-red-600 font-black' : 'text-blue-600 font-black'}>{budgetUsage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-700 ${budgetUsage > 100 ? 'bg-red-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(budgetUsage, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-[1.5rem] border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Custo Previsto</p>
                      <p className="font-black text-slate-700 text-lg">{formatCurrency(totalUnitsCost)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-[1.5rem] border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Despesas Reais</p>
                      <p className="font-black text-slate-800 text-lg">{formatCurrency(totalActualExpenses)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-blue-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <h4 className="font-black mb-6 uppercase text-sm tracking-widest opacity-80 relative z-10">Expectativa de Vendas</h4>
                <div className="space-y-6 relative z-10">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-black uppercase opacity-60">Valor Est. de Venda</p>
                      <p className="text-4xl font-black">{formatCurrency(totalEstimatedSales)}</p>
                    </div>
                    <i className="fa-solid fa-chart-line text-5xl opacity-20 mb-1"></i>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-white/15 backdrop-blur-md p-5 rounded-[1.8rem] border border-white/10">
                      <p className="text-[10px] font-black uppercase opacity-70 mb-2">Estimativa de Lucro Bruto</p>
                      <p className="text-2xl font-black text-white">{formatCurrency(estimatedGrossProfit)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <div className="animate-in fade-in duration-300">
            <UnitsSection
              project={project}
              user={user}
              onAddUnit={handleAddUnit}
              onUpdateUnit={handleUpdateUnit}
              logChange={logChange}
            />
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="animate-in fade-in duration-300">
            <ExpensesSection
              project={project}
              user={user}
              onAddExpense={handleAddExpense}
              onUpdate={(expenses) => onUpdate(project.id, { expenses })}
              logChange={logChange}
            />
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="animate-in fade-in duration-300">
            <div className="bg-amber-50 border border-amber-100 p-5 rounded-[2rem] text-amber-800 text-xs mb-6 font-bold flex items-center">
              <i className="fa-solid fa-shield-halved mr-3 text-lg opacity-50"></i> Todas as alterações nesta obra são registradas automaticamente.
            </div>
            <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2 scrollbar-hide">
              {project.logs.slice().reverse().map(log => (
                <div key={log.id} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 text-sm">
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-black text-slate-800 uppercase text-[10px] tracking-widest">{log.action}: {log.field}</span>
                    <span className="text-[10px] font-bold text-slate-400">{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-4">Usuário: <span className="text-blue-600 font-bold">{log.userName}</span></p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-white p-4 rounded-[1.2rem] border border-slate-100">
                      <p className="text-[8px] uppercase font-black text-slate-400 mb-1">De</p>
                      <p className="truncate text-slate-600 font-bold text-xs">{log.oldValue}</p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-slate-300 text-xs"></i>
                    <div className="flex-1 bg-blue-50 p-4 rounded-[1.2rem] border border-blue-100">
                      <p className="text-[8px] uppercase font-black text-blue-400 mb-1">Para</p>
                      <p className="truncate text-blue-700 font-bold text-xs">{log.newValue}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
  onAddUnit: (u: any) => void,
  onUpdateUnit: (id: string, updates: Partial<Unit>) => void,
  logChange: (a: string, f: string, o: string, n: string) => void
}> = ({ project, user, onAddUnit, onUpdateUnit, logChange }) => {
  const [showAdd, setShowAdd] = useState(false);
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

  const handleLocalUpdateUnit = (unitId: string, updates: Partial<Unit>) => {
    onUpdateUnit(unitId, updates);
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center px-2">
        <h3 className="font-black text-slate-800 text-xl uppercase tracking-tight">Portfólio de Unidades</h3>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white px-8 py-3 rounded-full font-black text-sm hover:bg-blue-700 transition shadow-xl shadow-blue-100 flex items-center">
            <i className="fa-solid fa-plus mr-2"></i> Adicionar Unidade
          </button>
        )}
      </div>

      {showAdd && (
        <form
          className="p-8 bg-blue-50 border-2 border-blue-100 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-5 gap-6 animate-in slide-in-from-top-6"
          onSubmit={(e) => {
            e.preventDefault();
            onAddUnit(formData);
            setShowAdd(false);
            setFormData({
              identifier: '',
              area: 0,
              cost: 0,
              valorEstimadoVenda: 0,
              status: 'Available'
            });
          }}
        >
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-600 uppercase ml-3">Identificador</label>
            <input required className="w-full p-4 bg-white border-2 border-transparent rounded-full text-sm font-black outline-none focus:border-blue-500 shadow-sm" placeholder="Ex: Casa 01" value={formData.identifier} onChange={e => setFormData({ ...formData, identifier: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-600 uppercase ml-3">Área (m²)</label>
            <input required type="number" className="w-full p-4 bg-white border-2 border-transparent rounded-full text-sm font-black outline-none focus:border-blue-500 shadow-sm" value={formData.area} onChange={e => setFormData({ ...formData, area: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-600 uppercase ml-3">Custo (R$)</label>
            <input required type="number" className="w-full p-4 bg-slate-100 border-2 border-transparent rounded-full text-sm font-black outline-none focus:border-blue-500 shadow-inner" value={formData.cost} onChange={e => setFormData({ ...formData, cost: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-blue-600 uppercase ml-3">Estimativa Venda</label>
            <input required type="number" className="w-full p-4 bg-slate-100 border-2 border-transparent rounded-full text-sm font-black outline-none focus:border-blue-500 shadow-inner" value={formData.valorEstimadoVenda} onChange={e => setFormData({ ...formData, valorEstimadoVenda: Number(e.target.value) })} />
          </div>
          <div className="flex gap-3 h-[58px] mt-auto">
            <button type="submit" className="flex-1 bg-blue-600 text-white rounded-full font-black text-xs shadow-lg shadow-blue-200 uppercase tracking-widest">Salvar</button>
            <button type="button" onClick={() => setShowAdd(false)} className="w-14 bg-white text-slate-400 rounded-full border border-slate-200 hover:text-red-500 transition"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {project.units.map(unit => {
          const roi = (unit.saleValue && unit.saleValue > 0 && unit.cost > 0)
            ? (unit.saleValue - unit.cost) / unit.cost
            : null;

          const months = (roi !== null && unit.saleDate && firstExpenseDate)
            ? calculateMonthsBetween(firstExpenseDate, unit.saleDate)
            : null;

          const roiMensal = (roi !== null && months !== null && months > 0) ? roi / months : null;

          return (
            <div key={unit.id} className="bg-white border-2 border-indigo-600/10 rounded-[2.5rem] p-7 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <h5 className="font-black text-slate-800 text-xl group-hover:text-blue-600 transition-colors">{unit.identifier}</h5>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{unit.area} m² de área total</p>
                </div>
                <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${unit.status === 'Sold' ? 'bg-green-600 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                  {unit.status === 'Sold' ? 'Vendida' : 'À Venda'}
                </div>
              </div>

              <div className="space-y-5 mb-8 relative z-10">
                <div className="bg-slate-50 p-4 rounded-[1.8rem] flex justify-between items-center border-2 border-indigo-50">
                  <span className="text-slate-400 font-black uppercase tracking-widest text-[9px] ml-2">Investimento</span>
                  <span className="font-black text-slate-700 text-base mr-2">{formatCurrency(unit.cost)}</span>
                </div>

                <div className="p-4 rounded-[1.8rem] flex justify-between items-center border-2 border-blue-100 bg-white">
                  <span className="text-blue-400 font-black uppercase tracking-widest text-[9px] ml-2">Venda Estimada</span>
                  <div className="relative">
                    <span className="absolute left-[-22px] top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-300">R$</span>
                    <input
                      type="number"
                      className="w-28 bg-blue-50/30 p-2 rounded-xl text-right font-black text-blue-700 outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
                      defaultValue={unit.valorEstimadoVenda || 0}
                      onBlur={(e) => handleLocalUpdateUnit(unit.id, { valorEstimadoVenda: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="pt-6 mt-4 border-t border-slate-50">
                  {canEditVenda ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-[1.8rem] border-2 border-slate-100 space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Valor Realizado</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-300">R$</span>
                          <input
                            type="number"
                            className="w-full pl-10 pr-4 py-3.5 bg-slate-900 text-white rounded-[1.2rem] text-sm font-black outline-none focus:ring-4 focus:ring-blue-500/20 transition"
                            placeholder="0,00"
                            defaultValue={unit.saleValue}
                            onBlur={(e) => handleLocalUpdateUnit(unit.id, { saleValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="p-4 rounded-[1.8rem] border-2 border-slate-100 space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase ml-4">Data da Venda</label>
                        <input
                          type="date"
                          className="w-full px-5 py-3.5 bg-slate-100 text-slate-700 rounded-[1.2rem] text-xs font-black outline-none border-2 border-transparent focus:border-blue-500 transition"
                          defaultValue={unit.saleDate}
                          onBlur={(e) => handleLocalUpdateUnit(unit.id, { saleDate: e.target.value === "" ? undefined : e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50/80 p-6 rounded-[2rem] text-center border-2 border-dashed border-slate-100">
                      <i className="fa-solid fa-lock text-slate-200 text-xl mb-2"></i>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-relaxed">Registro de venda disponível<br />após conclusão da obra</p>
                    </div>
                  )}
                </div>
              </div>

              {roi !== null && (
                <div className="flex gap-3 pt-6 border-t border-slate-50 relative z-10">
                  <div className="flex-1 bg-green-50 p-4 rounded-[1.5rem] text-center border border-green-100 shadow-sm">
                    <p className="text-[9px] font-black text-green-600 uppercase tracking-widest mb-1">ROI Real</p>
                    <p className="text-lg font-black text-green-700">{(roi * 100).toFixed(2)}%</p>
                  </div>
                  <div className="flex-1 bg-blue-50 p-4 rounded-[1.5rem] text-center border border-blue-100 shadow-sm">
                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">ROI Mensal</p>
                    <p className="text-lg font-black text-blue-700">{roiMensal !== null ? `${(roiMensal * 100).toFixed(2)}%` : '--'}</p>
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
        <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">Fluxo de Despesas</h3>
        <button onClick={() => setShowAdd(true)} className="bg-blue-600 text-white px-8 py-3 rounded-full font-black text-sm hover:bg-blue-700 transition shadow-xl shadow-blue-100">
          <i className="fa-solid fa-receipt mr-2"></i> Lançar Despesa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-50 p-7 rounded-[2.5rem] border border-slate-100">
          <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Total Desembolsado</p>
          <p className="text-3xl font-black text-slate-800">{formatCurrency(project.expenses.reduce((a, b) => a + b.value, 0))}</p>
        </div>
        <div className="bg-blue-50 p-7 rounded-[2.5rem] border border-blue-100">
          <p className="text-[10px] text-blue-400 font-black uppercase mb-1">Volume de Lançamentos</p>
          <p className="text-3xl font-black text-blue-800">
            {project.expenses.length} <span className="text-xs opacity-40 uppercase ml-1">Notas</span>
          </p>
        </div>
      </div>

      {showAdd && (
        <form className="p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-4 gap-6 animate-in slide-in-from-top-4" onSubmit={(e) => { e.preventDefault(); onAddExpense(formData); setShowAdd(false); }}>
          <div className="md:col-span-1 space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Descrição</label>
            <input required className="w-full px-6 py-3.5 bg-white border border-slate-200 rounded-full text-sm font-black outline-none focus:border-blue-500" placeholder="Ex: Cimento, Pintor..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Valor (R$)</label>
            <input required type="number" className="w-full px-6 py-3.5 bg-slate-100 border border-slate-200 rounded-full text-sm font-black outline-none focus:border-blue-500" value={formData.value} onChange={e => setFormData({ ...formData, value: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase ml-4">Data</label>
            <input required type="date" className="w-full px-6 py-3.5 bg-white border border-slate-200 rounded-full text-sm font-black outline-none focus:border-blue-500" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
          </div>
          <div className="flex gap-3 h-[52px] mt-auto">
            <button type="submit" className="flex-1 bg-blue-600 text-white rounded-full font-black text-xs uppercase tracking-widest">Salvar</button>
            <button type="button" onClick={() => setShowAdd(false)} className="w-14 bg-slate-200 text-slate-600 rounded-full"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black uppercase text-[9px] tracking-widest">
            <tr>
              <th className="px-10 py-6">Data</th>
              <th className="px-10 py-6">Descrição</th>
              <th className="px-10 py-6">Autor</th>
              <th className="px-10 py-6 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {project.expenses.map(exp => (
              <tr key={exp.id} className="hover:bg-slate-50/50 transition">
                <td className="px-10 py-6">
                  {isAdmin ? (
                    <input
                      type="date"
                      className="p-2 border border-slate-100 rounded-xl text-xs bg-transparent outline-none focus:border-blue-600 font-black text-slate-600"
                      defaultValue={exp.date}
                      onBlur={(e) => handleEditExpense(exp.id, 'date', e.target.value)}
                    />
                  ) : (
                    <span className="font-bold text-slate-600">{new Date(exp.date).toLocaleDateString('pt-BR')}</span>
                  )}
                </td>
                <td className="px-10 py-6 font-black text-slate-800">{exp.description}</td>
                <td className="px-10 py-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200">{exp.userName[0].toUpperCase()}</div>
                    <span className="text-slate-500 font-bold">{exp.userName}</span>
                  </div>
                </td>
                <td className="px-10 py-6 text-right">
                  {isAdmin ? (
                    <input
                      type="number"
                      className="p-2 bg-blue-50/50 border border-blue-100 rounded-xl text-xs text-right w-28 outline-none focus:ring-2 focus:ring-blue-500 font-black text-blue-700"
                      defaultValue={exp.value}
                      onBlur={(e) => handleEditExpense(exp.id, 'value', Number(e.target.value))}
                    />
                  ) : (
                    <span className="font-black text-slate-800">{formatCurrency(exp.value)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectDetail;
