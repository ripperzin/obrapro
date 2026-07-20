import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Project, ProgressStage, Expense, getCurrentStagePhoto } from '../types';
import { formatCurrency, calculateMonthsBetween, formatCurrencyAbbrev, getDeliveryStatus, DeliveryTone } from '../utils';

// Classes do selo de prazo por tom.
const prazoToneCls = (tone: DeliveryTone): string => ({
  green: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  red: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
  blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  slate: 'bg-slate-700/40 text-slate-400 border border-slate-600/40',
}[tone]);
import { useInflation } from '../hooks/useInflation';
import { computeProjectFinance } from '../utils/projectFinance';

import ConfirmModal from './ConfirmModal';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import StageThumbnail from './StageThumbnail';
import QuickExpenseModal from './QuickExpenseModal';
import SwipeableProjectItem from './SwipeableProjectItem';
import NewObraModal from './NewObraModal';
import { usePlan } from './PlanProvider';

interface GeneralDashboardProps {
   projects: Project[];
   userName?: string;
   userId?: string;
   onSelectProject?: (id: string) => void;
   onAddProject?: (project: any) => void;
   onUpdate?: (id: string, updates: Partial<Project>, logMsg?: string) => void;
   onDelete?: (id: string) => void;
   onAddExpense?: (projectId: string, expense: Omit<Expense, 'id' | 'userId' | 'userName'>) => void;
   isAdmin?: boolean;
}

const GeneralDashboard: React.FC<GeneralDashboardProps> = ({
   projects,
   userName = 'Usuário',
   userId,
   onSelectProject,
   onAddProject,
   onUpdate,
   onDelete,
   onAddExpense,
   isAdmin = false
}) => {
   const [showModal, setShowModal] = useState(false);
   const [editingProject, setEditingProject] = useState<Project | null>(null);
   const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
   const [showNew, setShowNew] = useState(false);
   const [showArchived, setShowArchived] = useState(false);
   const { ent, openUpgrade } = usePlan();

   // Obras arquivadas saem da lista ativa e não entram nos números do portfólio.
   const activeProjects = projects.filter(p => !p.archived);
   const archivedProjects = projects.filter(p => p.archived);
   const visibleProjects = showArchived ? archivedProjects : activeProjects;
   // Vagas de obra ativa acabaram? O botão continua lá, com cadeado.
   const obrasCheias = activeProjects.length >= ent.maxObrasAtivas;

   const toggleArchive = (e: React.MouseEvent | null, p: Project) => {
      e?.stopPropagation();
      onUpdate?.(p.id, { archived: !p.archived }, p.archived ? `Obra desarquivada: ${p.name}` : `Obra arquivada: ${p.name}`);
   };

   // Sync showModal (New Project) with URL
   useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'new-project' && !showModal && !editingProject) {
         openAddModal();
      }
   }, []);

   const handleSetShowModal = (show: boolean) => {
      const params = new URLSearchParams(window.location.search);
      if (show && !editingProject) {
         params.set('action', 'new-project');
      } else {
         params.delete('action');
         // Se fechando, limpar draft se não estiver editando (ou seja, se for novo)
         if (!editingProject) localStorage.removeItem('draft_new_project');
      }
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      setShowModal(show);
   };



   const [showExpenseModal, setShowExpenseModal] = useState(false);
   const [expenseFormData, setExpenseFormData] = useState({
      projectId: '',
      description: '',
      value: 0,
      date: new Date().toISOString().split('T')[0],
      attachmentUrl: undefined as string | undefined
   });

   const [formData, setFormData] = useState({
      name: '',
      unitCount: 0,
      totalArea: 0,
      expectedTotalCost: 0,
      expectedTotalSales: 0,
      progress: ProgressStage.PLANNING,
      startDate: '',
      deliveryDate: ''
   });

   // DRAFT PERSISTENCE
   const DRAFT_KEY = 'draft_new_project';

   // Restore on open
   useEffect(() => {
      if (showModal && !editingProject) {
         const saved = localStorage.getItem(DRAFT_KEY);
         if (saved) {
            try {
               setFormData(JSON.parse(saved));
            } catch (e) {
               console.error('Error parsing draft', e);
            }
         }
      }
   }, [showModal, editingProject]);

   // Save on change
   useEffect(() => {
      if (showModal && !editingProject) {
         localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
      }
   }, [formData, showModal, editingProject]);

   const unitsInventory = activeProjects.reduce((acc, p) => {
      p.units.forEach(u => {
         if (u.status === 'Available') {
            acc.availableCount += 1;
            acc.totalPotentialSale += (u.valorEstimadoVenda || 0);
         } else {
            acc.soldCount += 1;
            acc.realizedValue += (u.saleValue || 0);
         }
      });
      return acc;
   }, { availableCount: 0, soldCount: 0, totalPotentialSale: 0, realizedValue: 0 });

   // Cálculo de Margens (ROI e ROI Mensal)
   let totalRoi = 0;
   let totalMonthlyRoi = 0;
   let soldUnitsCount = 0;

   activeProjects.forEach(project => {
      const isCompleted = project.progress === 100;
      const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);
      const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);
      // Terreno + custos de aquisição entram no custo da casa (rateio por área) — senão o ROI infla.
      const aquisicaoTotal = (project.acquisitionCosts || []).reduce((sum, a) => sum + (a.value || 0), 0);

      const firstExpenseDate = project.expenses.length > 0
         ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date)
         : null;

      project.units.forEach(unit => {
         if (unit.status === 'Sold' && unit.saleValue) {
            const areaShare = totalUnitsArea > 0 ? unit.area / totalUnitsArea : 0;
            const terrenoShare = areaShare * aquisicaoTotal;
            const realCost = (isCompleted && totalUnitsArea > 0)
               ? areaShare * totalExpenses + terrenoShare
               : unit.cost + terrenoShare;

            const costBase = realCost > 0 ? realCost : unit.cost;

            if (costBase > 0) {
               const roi = (unit.saleValue - costBase) / costBase;

               const months = (roi !== null && unit.saleDate && firstExpenseDate)
                  ? calculateMonthsBetween(firstExpenseDate, unit.saleDate)
                  : null;

               const roiMensal = (months !== null && months > 0) ? roi / months : 0;

               totalRoi += roi;
               totalMonthlyRoi += roiMensal;
               soldUnitsCount++;
            }
         }
      });
   });

   const { inflationRate } = useInflation();

   const avgRoi = soldUnitsCount > 0 ? totalRoi / soldUnitsCount : 0;
   const avgMonthlyRoi = soldUnitsCount > 0 ? totalMonthlyRoi / soldUnitsCount : 0;
   const avgRealMonthlyRoi = avgMonthlyRoi - inflationRate;

   const totalUnits = unitsInventory.availableCount + unitsInventory.soldCount;
   const salesPerformance = totalUnits > 0 ? (unitsInventory.soldCount / totalUnits) * 100 : 0;

   // Números do portfólio pela fonte única (Resultado). Já descontam terreno.
   const portfolioFin = activeProjects.map(p => computeProjectFinance(p));
   const portfolioLucroProj = portfolioFin.reduce((s, f) => s + f.lucroProjetado, 0);
   // Margem = lucro ÷ receita (padrão do app: Resultado, Sócios, Unidades).
   const totalVendasReal = portfolioFin.reduce((s, f) => s + f.vendasRealizadas, 0);
   const totalLucroReal = portfolioFin.reduce((s, f) => s + f.lucroReal, 0);
   const portfolioMargem = totalVendasReal > 0 ? (totalLucroReal / totalVendasReal) * 100 : null;

   // Data atual formatada
   const today = new Date();
   const formattedDate = today.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
   });

   // Circumference for progress ring (radius 90)
   const circumference = 2 * Math.PI * 90;
   const strokeDashoffset = circumference - (circumference * salesPerformance / 100);

   const requestDelete = (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      setProjectToDelete(projectId);
   };

   const handleConfirmDelete = () => {
      if (projectToDelete && onDelete) {
         onDelete(projectToDelete);
         setProjectToDelete(null);
      }
   };

   const openEditModal = (e: React.MouseEvent, project: Project) => {
      e.stopPropagation();
      setEditingProject(project);
      setFormData({
         name: project.name,
         unitCount: 0,
         totalArea: 0,
         expectedTotalCost: 0,
         expectedTotalSales: 0,
         progress: project.progress,
         startDate: project.startDate || '',
         deliveryDate: project.deliveryDate || ''
      });
      handleSetShowModal(true);
   };

   // Funil único de "Nova obra" (os dois botões e o atalho ?action=new-project
   // passam por aqui). Obra ARQUIVADA não ocupa vaga — só as ativas contam.
   const openAddModal = () => {
      if (activeProjects.length >= ent.maxObrasAtivas) {
         openUpgrade('obras');
         return;
      }
      setEditingProject(null);
      setShowNew(true);
   };

   const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      if (editingProject && onUpdate) {
         // Manda '' cru (não `|| undefined`): mutationFunctions converte para null e
         // limpa a data. Com undefined o campo é pulado e apagar a data não faz nada.
         const updates: Partial<Project> = {
            name: formData.name,
            startDate: formData.startDate,
            deliveryDate: formData.deliveryDate
         };
         onUpdate(editingProject.id, updates, `Obra atualizada: ${formData.name}`);
      } else if (onAddProject) {
         onAddProject(formData);
      }

      setShowModal(false);
   };

   const openExpenseModal = () => {
      setExpenseFormData({
         projectId: projects.length > 0 ? projects[0].id : '',
         description: '',
         value: 0,
         date: new Date().toISOString().split('T')[0],
         attachmentUrl: undefined
      });
      setShowExpenseModal(true);
   };

   const handleExpenseSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!expenseFormData.projectId || !onAddExpense) return;

      onAddExpense(expenseFormData.projectId, {
         description: expenseFormData.description,
         value: expenseFormData.value,
         date: expenseFormData.date,
         attachmentUrl: expenseFormData.attachmentUrl
      });

      setShowExpenseModal(false);
   };

   const modalRoot = document.getElementById('modal-root');

   return (
      <div className="animate-fade-in min-h-full">
         {/* ===== MOBILE LAYOUT ===== */}
         <div className="block md:hidden space-y-4">
            <div className="space-y-4">
               <div className="flex justify-between items-end mb-2">
                  <h2 className="text-white font-bold text-lg">Resumo Geral</h2>
                  <span className="text-slate-400 text-xs">{formattedDate}</span>
               </div>

               <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-2 opacity-20">
                        <i className="fa-solid fa-check-circle text-4xl text-green-500 transform rotate-12"></i>
                     </div>
                     <i className="fa-solid fa-house-circle-check text-green-400 text-2xl mb-1"></i>
                     <p className="text-white font-black text-3xl">{unitsInventory.soldCount}</p>
                     <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Vendidas</p>
                  </div>

                  <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-2 opacity-20">
                        <i className="fa-solid fa-box-open text-4xl text-orange-500 transform rotate-12"></i>
                     </div>
                     <i className="fa-solid fa-key text-orange-400 text-2xl mb-1"></i>
                     <p className="text-white font-black text-3xl">{unitsInventory.availableCount}</p>
                     <p className="text-orange-400 text-[10px] font-bold uppercase tracking-widest">Estoque</p>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 relative overflow-hidden">
                     <i className="fa-solid fa-money-bill-trend-up text-green-400 text-2xl mb-1"></i>
                     <p className="text-white font-black text-xl tracking-tight whitespace-nowrap">{formatCurrencyAbbrev(unitsInventory.realizedValue)}</p>
                     <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Recebido</p>
                  </div>

                  <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-0.5 relative overflow-hidden">
                     <i className="fa-solid fa-sack-dollar text-cyan-400 text-2xl mb-1"></i>
                     <p className={`font-black text-xl tracking-tight whitespace-nowrap ${portfolioLucroProj >= 0 ? 'text-white' : 'text-rose-400'}`}>{formatCurrencyAbbrev(portfolioLucroProj)}</p>
                     <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Lucro projetado</p>
                     {portfolioMargem !== null && <p className="text-slate-600 text-[9px] font-bold">margem {portfolioMargem.toFixed(0)}%</p>}
                  </div>
               </div>
            </div>
         </div>

         {isAdmin && onAddExpense && projects.length > 0 && (
            <div className="mt-8 mb-6 block md:hidden">
               <button
                  onClick={openExpenseModal}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-green-600/20 border border-green-500/40 rounded-2xl text-green-400 hover:bg-green-600/30 transition-all active:scale-[0.98]"
               >
                  <i className="fa-solid fa-receipt text-lg"></i>
                  <span className="font-black text-sm uppercase tracking-wider">Adicionar Despesa</span>
               </button>
            </div>
         )}

         <div className="space-y-4 block md:hidden">
            <div className="flex justify-between items-center">
               <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest">{showArchived ? 'Arquivadas' : 'Seus Projetos'}</h3>
               {isAdmin && onAddProject && !showArchived && (
                  <button
                     onClick={() => openAddModal()}
                     className="px-4 py-2 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-400 flex items-center gap-2 hover:bg-blue-600/30 transition-all active:scale-95"
                  >
                     <i className={`fa-solid ${obrasCheias ? 'fa-lock text-amber-400' : 'fa-plus'} text-xs`}></i>
                     <span className="font-black text-[10px] uppercase tracking-wider">Adicionar Obra</span>
                  </button>
               )}
            </div>
            {visibleProjects.length === 0 && (
               <p className="text-slate-500 text-sm text-center py-8">
                  {showArchived ? 'Nenhuma obra arquivada.' : 'Nenhuma obra ativa. Adicione a primeira.'}
               </p>
            )}
            {visibleProjects.map(p => {
               const sold = p.units.filter(u => u.status === 'Sold').length;
               const total = p.units.length;
               return (
                  <SwipeableProjectItem
                     key={p.id}
                     project={p}
                     sold={sold}
                     total={total}
                     onSelect={(id) => onSelectProject?.(id)}
                     onEdit={(p) => openEditModal({ stopPropagation: () => { } } as any, p)}
                     onDelete={(id) => requestDelete({ stopPropagation: () => { } } as any, id)}
                     onArchive={(p) => toggleArchive(null, p)}
                     isAdmin={isAdmin}
                  />
               );
            })}
            {(archivedProjects.length > 0 || showArchived) && (
               <button
                  onClick={() => setShowArchived(v => !v)}
                  className="w-full py-3 text-slate-400 text-xs font-bold uppercase tracking-wider hover:text-white transition flex items-center justify-center gap-2"
               >
                  <i className={`fa-solid ${showArchived ? 'fa-arrow-left' : 'fa-box-archive'} text-[11px]`}></i>
                  {showArchived ? 'Ver obras ativas' : `Ver arquivadas (${archivedProjects.length})`}
               </button>
            )}
         </div>

         {/* ===== DESKTOP LAYOUT (Horizontal Ribbon - Opção 2) ===== */}
         <div className="hidden md:block">
            {/* Top Ribbon Container */}
            <div className="p-8 pb-4">
               <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-[2.5rem] p-8 flex items-center justify-between gap-10 shadow-2xl">
                  {/* KPI Items Scrollable/Flex Area */}
                  <div className="w-full flex items-center justify-between gap-4">
                     {/* Vendidas */}
                     <div className="flex flex-col items-center justify-center gap-2 px-6 py-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-colors group flex-1 h-36">
                        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-1">
                           <i className="fa-solid fa-house-circle-check text-blue-400 text-xl"></i>
                        </div>
                        <p className="text-white font-black text-2xl leading-none">{unitsInventory.soldCount}</p>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">Vendidas</p>
                     </div>

                     {/* Estoque */}
                     <div className="flex flex-col items-center justify-center gap-2 px-6 py-6 rounded-3xl bg-orange-500/5 border border-orange-500/10 hover:bg-orange-500/10 transition-colors group flex-1 h-36">
                        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-1">
                           <i className="fa-solid fa-key text-orange-400 text-xl"></i>
                        </div>
                        <p className="text-white font-black text-2xl leading-none">{unitsInventory.availableCount}</p>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">Estoque</p>
                     </div>

                     {/* Faturado */}
                     <div className="flex flex-col items-center justify-center gap-2 px-6 py-6 rounded-3xl bg-green-500/5 border border-green-500/10 hover:bg-green-500/10 transition-colors group flex-1 h-36">
                        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mb-1">
                           <i className="fa-solid fa-money-bill-trend-up text-green-400 text-xl"></i>
                        </div>
                        <p className="text-white font-black text-2xl leading-none whitespace-nowrap">{formatCurrencyAbbrev(unitsInventory.realizedValue)}</p>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">Recebido</p>
                     </div>

                     {/* Lucro projetado do portfólio (margem como subtítulo) */}
                     <div className="flex flex-col items-center justify-center gap-2 px-6 py-6 rounded-3xl bg-cyan-500/5 border border-cyan-500/10 hover:bg-cyan-500/10 transition-colors group flex-1 h-36">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-1">
                           <i className="fa-solid fa-sack-dollar text-cyan-400 text-xl"></i>
                        </div>
                        <div className="text-center flex flex-col items-center">
                           <p className={`font-black text-2xl leading-none whitespace-nowrap ${portfolioLucroProj >= 0 ? 'text-white' : 'text-rose-400'}`}>
                              {formatCurrencyAbbrev(portfolioLucroProj)}
                           </p>
                           <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mt-1">Lucro projetado</p>
                           {portfolioMargem !== null && <p className="text-slate-600 text-[9px] font-bold mt-0.5">margem {portfolioMargem.toFixed(0)}%</p>}
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Desktop Projects Grid - CLICKABLE PREMIUM CARDS */}
            <div className="px-10">
               <div className="flex justify-between items-center mb-8">
                  <h3 className="text-white font-black text-2xl flex items-center gap-3">
                     <i className={`fa-solid ${showArchived ? 'fa-box-archive text-slate-400' : 'fa-building text-blue-400'}`}></i>
                     {showArchived ? 'ARQUIVADAS' : 'EMPREENDIMENTOS'}
                  </h3>
                  <div className="flex items-center gap-3">
                     {(archivedProjects.length > 0 || showArchived) && (
                        <button
                           onClick={() => setShowArchived(v => !v)}
                           className="px-5 py-3 bg-slate-800/60 text-slate-300 rounded-2xl hover:bg-slate-700 active:scale-95 transition-all font-bold text-sm flex items-center gap-2 border border-slate-700/50"
                        >
                           <i className={`fa-solid ${showArchived ? 'fa-arrow-left' : 'fa-box-archive'}`}></i>
                           {showArchived ? 'Ver ativas' : `Arquivadas (${archivedProjects.length})`}
                        </button>
                     )}
                     {onAddProject && !showArchived && (
                        <button
                           onClick={openAddModal}
                           className="px-8 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 hover:-translate-y-2 active:scale-95 transition-all shadow-lg shadow-blue-600/30 font-black flex items-center gap-2 border border-blue-400/50"
                        >
                           <i className={`fa-solid ${obrasCheias ? 'fa-lock' : 'fa-plus'}`}></i>
                           NOVA OBRA
                        </button>
                     )}
                  </div>
               </div>

               {visibleProjects.length === 0 && (
                  <p className="text-slate-500 text-center py-16">
                     {showArchived ? 'Nenhuma obra arquivada.' : 'Nenhuma obra ativa. Clique em "Nova obra" para começar.'}
                  </p>
               )}
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                  {visibleProjects.map(p => {
                     const sold = p.units.filter(u => u.status === 'Sold').length;
                     const total = p.units.length;
                     return (
                        <div
                           key={p.id}
                           onClick={() => onSelectProject?.(p.id)}
                           className="bg-slate-800/40 backdrop-blur-md rounded-[2.5rem] overflow-hidden border border-slate-700/50 hover:border-blue-500/50 transition-all hover:-translate-y-2 group cursor-pointer shadow-xl hover:shadow-blue-500/10"
                        >
                           <div className="h-48 relative overflow-hidden bg-slate-900">
                              {(() => {
                                 // Foto da ETAPA ATUAL da obra. Sem foto na etapa atual => placeholder
                                 // (não puxa foto de etapa anterior). Igual ao herói da aba Gestão.
                                 const photo = getCurrentStagePhoto(p);

                                 if (photo) {
                                    return <StageThumbnail photoPath={photo} className="w-full h-full" />;
                                 }
                                 return <div className="w-full h-full flex items-center justify-center bg-slate-800"><i className="fa-solid fa-city text-4xl text-slate-700"></i></div>;
                              })()}
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-60"></div>
                              <div className="absolute top-4 right-4 flex gap-2">
                                 {isAdmin && (
                                    <>
                                       {!p.archived && (
                                          <button onClick={(e) => openEditModal(e, p)} className="w-8 h-8 rounded-lg bg-slate-900/80 backdrop-blur-md text-blue-400 flex items-center justify-center border border-slate-700 hover:bg-blue-600 hover:text-white transition" title="Editar">
                                             <i className="fa-solid fa-pen text-xs"></i>
                                          </button>
                                       )}
                                       <button onClick={(e) => toggleArchive(e, p)} className="w-8 h-8 rounded-lg bg-slate-900/80 backdrop-blur-md text-amber-400 flex items-center justify-center border border-slate-700 hover:bg-amber-600 hover:text-white transition" title={p.archived ? 'Desarquivar' : 'Arquivar'}>
                                          <i className={`fa-solid ${p.archived ? 'fa-box-open' : 'fa-box-archive'} text-xs`}></i>
                                       </button>
                                       <button onClick={(e) => requestDelete(e, p.id)} className="w-8 h-8 rounded-lg bg-slate-900/80 backdrop-blur-md text-red-400 flex items-center justify-center border border-slate-700 hover:bg-red-600 hover:text-white transition" title="Excluir">
                                          <i className="fa-solid fa-trash text-xs"></i>
                                       </button>
                                    </>
                                 )}
                              </div>
                           </div>
                           <div className="p-8">
                              <h4 className="text-2xl font-black text-white mb-2 group-hover:text-blue-400 transition-colors uppercase tracking-tight">{p.name}</h4>
                              <div className="flex justify-between items-center mb-6">
                                 <span className="text-slate-400 font-bold text-sm tracking-widest">{sold}/{total} VENDIDAS</span>
                                 <span className="text-blue-400 font-black">{p.progress}%</span>
                              </div>
                              <div className="w-full bg-slate-900/50 h-3 rounded-full overflow-hidden border border-slate-700/30">
                                 <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${p.progress}%` }}></div>
                              </div>
                              {(() => {
                                 const st = getDeliveryStatus(p.deliveryDate, p.progress);
                                 return (
                                    <div className="flex items-center justify-between gap-2 mt-5">
                                       <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 ${prazoToneCls(st.tone)}`}>{st.label}</span>
                                       <span className="text-slate-500 text-xs font-bold text-right leading-tight">
                                          {st.dateLabel && <>Entrega {st.dateLabel}</>}
                                          {st.dateLabel && st.detail && ' · '}
                                          {st.detail}
                                       </span>
                                    </div>
                                 );
                              })()}
                           </div>
                        </div>
                     );
                  })}
               </div>
            </div>
         </div>

         {/* MODALS SECTION */}
         {showNew && (
            <NewObraModal
               onClose={() => setShowNew(false)}
               onCreated={(id) => onSelectProject?.(id)}
               userId={userId}
               userName={userName}
            />
         )}

         {showModal && modalRoot && ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-fade-in">
               <div className="bg-slate-900 rounded-[3rem] p-10 w-full max-w-md border border-slate-800 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600"></div>
                  <div className="flex justify-between items-center mb-10">
                     <h2 className="text-2xl font-black text-white tracking-tight italic">{editingProject ? 'EDITAR OBRA' : 'NOVA OBRA'}</h2>
                     <button onClick={() => handleSetShowModal(false)} className="text-slate-500 hover:text-white transition"><i className="fa-solid fa-xmark text-xl"></i></button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-8">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">NOME DO PROJETO</label>
                        <input required type="text" className="w-full px-6 py-5 bg-slate-800/50 border border-slate-700/50 rounded-2xl outline-none focus:border-blue-500 transition-all font-bold text-white text-lg" placeholder="Ex: Residencial Aurora" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">INÍCIO</label>
                           <DateInput
                              value={formData.startDate}
                              onChange={(val) => setFormData({ ...formData, startDate: val })}
                              className="w-full px-4 py-5 bg-slate-800/50 border border-slate-700/50 rounded-2xl outline-none focus:border-blue-500 transition-all font-bold text-white text-center"
                              placeholder="DD/MM/AAAA"
                           />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">ENTREGA</label>
                           <DateInput
                              value={formData.deliveryDate}
                              onChange={(val) => setFormData({ ...formData, deliveryDate: val })}
                              className="w-full px-4 py-5 bg-slate-800/50 border border-slate-700/50 rounded-2xl outline-none focus:border-blue-500 transition-all font-bold text-white text-center"
                              placeholder="DD/MM/AAAA"
                           />
                        </div>
                     </div>
                     {/* O cronograma do Orçamento reparte o calendário entre estas duas datas. */}
                     <p className="text-[11px] text-slate-500 leading-snug -mt-4 ml-2">
                        <i className="fa-solid fa-circle-info mr-1 text-slate-600"></i>
                        Sem estas duas datas o botão <b>Gerar cronograma</b> do Orçamento não funciona.
                     </p>
                     <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-xl shadow-blue-600/20 active:scale-95">SALVAR ALTERAÇÕES</button>
                  </form>
               </div>
            </div>,
            modalRoot
         )}

         <QuickExpenseModal
            isOpen={showExpenseModal}
            onClose={() => setShowExpenseModal(false)}
            projects={projects}
            preSelectedProjectId={expenseFormData.projectId}
            onSave={(pid, expense) => onAddExpense?.(pid, expense)}
         />

         <ConfirmModal
            isOpen={!!projectToDelete}
            onClose={() => setProjectToDelete(null)}
            onConfirm={handleConfirmDelete}
            title="EXCLUIR OBRA?"
            message="Esta ação é permanente e apagará todos os dados vinculados."
            confirmText="SIM, EXCLUIR"
            cancelText="CANCELAR"
            variant="danger"
         />
      </div>
   );
};

export default GeneralDashboard;
