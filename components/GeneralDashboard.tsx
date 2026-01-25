
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Project, ProgressStage, Expense } from '../types';
import { formatCurrency, calculateMonthsBetween, formatCurrencyAbbrev } from '../utils';
import { useInflation } from '../hooks/useInflation';

import ConfirmModal from './ConfirmModal';
import MoneyInput from './MoneyInput';
import DateInput from './DateInput';
import AttachmentUpload from './AttachmentUpload';
import StageThumbnail from './StageThumbnail';
import QuickExpenseModal from './QuickExpenseModal';

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

   // Estados para modal de despesa rápida
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

   const unitsInventory = projects.reduce((acc, p) => {
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

   projects.forEach(project => {
      const isCompleted = project.progress === 100;
      const totalExpenses = project.expenses.reduce((sum, exp) => sum + exp.value, 0);
      const totalUnitsArea = project.units.reduce((sum, u) => sum + u.area, 0);

      const firstExpenseDate = project.expenses.length > 0
         ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date)
         : null;

      project.units.forEach(unit => {
         if (unit.status === 'Sold' && unit.saleValue) {
            const realCost = (isCompleted && totalUnitsArea > 0)
               ? (unit.area / totalUnitsArea) * totalExpenses
               : unit.cost;

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
      setShowModal(true);
   };

   const openAddModal = () => {
      setEditingProject(null);
      setFormData({
         name: '',
         unitCount: 0,
         totalArea: 0,
         expectedTotalCost: 0,
         expectedTotalSales: 0,
         progress: ProgressStage.PLANNING,
         startDate: '',
         deliveryDate: ''
      });
      setShowModal(true);
   };

   const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      if (editingProject && onUpdate) {
         const updates: Partial<Project> = {
            name: formData.name,
            startDate: formData.startDate || undefined,
            deliveryDate: formData.deliveryDate || undefined
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
      <div className="animate-fade-in min-h-full px-0 md:px-0">
         <div className="block md:hidden space-y-4">
            <div className="space-y-4 px-1">
               <div className="flex justify-between items-end mb-2 px-2">
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

               <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-1">
                     <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                           <i className="fa-solid fa-money-bill-trend-up text-green-400 text-xs"></i>
                        </div>
                        <span className="text-slate-300 text-xs font-bold uppercase tracking-wider">Receita Realizada</span>
                     </div>
                  </div>
                  <div className="mt-2">
                     <p className="text-white font-black text-2xl tracking-tight">{formatCurrency(unitsInventory.realizedValue)}</p>
                  </div>
               </div>

               <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-1">
                     <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                           <i className="fa-solid fa-chart-pie text-purple-400 text-xs"></i>
                        </div>
                        <span className="text-slate-300 text-xs font-bold uppercase tracking-wider">Potencial de Vendas</span>
                     </div>
                  </div>
                  <div className="mt-2">
                     <p className="text-white font-black text-2xl tracking-tight">{formatCurrencyAbbrev(unitsInventory.totalPotentialSale)}</p>
                     <div className="w-full h-1.5 bg-slate-700 rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-purple-500 w-2/3 rounded-full"></div>
                     </div>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                     <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Margem Média</p>
                     <p className="text-green-400 font-black text-2xl">{(avgRoi * 100).toFixed(0)}%</p>
                     <div className="w-12 h-1 bg-green-500/30 rounded-full mt-1"></div>
                  </div>

                  <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                     <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Margem Real (a.m.)</p>
                     <p className="text-blue-400 font-black text-2xl">{(avgRealMonthlyRoi * 100).toFixed(1)}%</p>
                     <div className="w-12 h-1 bg-blue-500/30 rounded-full mt-1"></div>
                  </div>
               </div>

               <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex flex-col">
                     <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Conversão de Vendas</p>
                     <p className="text-white font-black text-2xl mt-1">{salesPerformance.toFixed(1)}%</p>
                  </div>
                  <div className="h-10 w-32 bg-slate-700 rounded-full overflow-hidden relative">
                     <div
                        className="h-full bg-blue-500 absolute top-0 left-0 transition-all duration-1000"
                        style={{ width: `${salesPerformance}%` }}
                     ></div>
                  </div>
               </div>
            </div>
         </div>

         {isAdmin && onAddExpense && projects.length > 0 && (
            <div className="p-4 block md:hidden">
               <button
                  onClick={openExpenseModal}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-green-600/20 border border-green-500/40 rounded-2xl text-green-400 hover:bg-green-600/30 transition-all active:scale-[0.98]"
               >
                  <i className="fa-solid fa-receipt text-lg"></i>
                  <span className="font-black text-sm uppercase tracking-wider">Adicionar Despesa</span>
               </button>
            </div>
         )}

         <div className="space-y-4 px-4 block md:hidden">
            <div className="flex justify-between items-center px-2">
               <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest">Seus Projetos</h3>
               {isAdmin && onAddProject && (
                  <button
                     onClick={() => setShowModal(true)}
                     className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/30"
                  >
                     <i className="fa-solid fa-plus"></i>
                  </button>
               )}
            </div>
            {projects.map(p => {
               const sold = p.units.filter(u => u.status === 'Sold').length;
               const total = p.units.length;
               return (
                  <div
                     key={p.id}
                     onClick={() => onSelectProject?.(p.id)}
                     className="w-full py-4 flex items-center gap-4 bg-transparent border-b border-slate-800 active:bg-slate-800/50 transition-colors"
                  >
                     {(() => {
                        const evidencesWithPhotos = (p.stageEvidence || [])
                           .filter(e => e.photos && e.photos.length > 0)
                           .sort((a, b) => b.stage - a.stage);
                        const latestEvidence = evidencesWithPhotos[0];
                        const photo = latestEvidence?.photos?.[0];

                        if (photo) {
                           return (
                              <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 border-blue-500/30">
                                 <StageThumbnail photoPath={photo} className="w-full h-full" />
                              </div>
                           );
                        }
                        return (
                           <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
                              <i className="fa-solid fa-building text-2xl text-slate-400"></i>
                           </div>
                        );
                     })()}
                     <div className="flex-1 min-w-0">
                        <p className="text-white font-bold truncate">{p.name}</p>
                        <p className="text-slate-400 text-sm">{sold} de {total} vendidas</p>
                     </div>
                     <div className="relative w-14 h-14 shrink-0">
                        <svg className="w-full h-full transform -rotate-90">
                           <circle cx="28" cy="28" r="24" stroke="#334155" strokeWidth="4" fill="transparent" />
                           <circle
                              cx="28" cy="28" r="24"
                              stroke="#22c55e" strokeWidth="4" fill="transparent"
                              strokeDasharray={2 * Math.PI * 24}
                              strokeDashoffset={2 * Math.PI * 24 - (2 * Math.PI * 24 * p.progress / 100)}
                              strokeLinecap="round"
                              className="progress-ring-circle"
                           />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">
                           {p.progress}%
                        </span>
                     </div>
                     <i className="fa-solid fa-chevron-right text-slate-500"></i>
                  </div>
               );
            })}
         </div>

         <div className="hidden md:block">
            <div className="mb-8 p-8">
               <h1 className="text-5xl font-black text-white italic tracking-tight">Olá, {userName}!</h1>
               <p className="text-slate-400 text-lg mt-2">Hoje: {formattedDate}</p>
            </div>

            <div className="flex gap-8 items-center justify-center mb-12">
               <div className="flex flex-col gap-5">
                  <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-blue-500 group">
                     <div>
                        <div className="flex items-center gap-2 mb-2">
                           <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Vendidas</span>
                        </div>
                        <p className="text-4xl font-black text-white">{unitsInventory.soldCount}</p>
                     </div>
                  </div>
                  <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-orange-500 group">
                     <div>
                        <div className="flex items-center gap-2 mb-2">
                           <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Disponíveis</span>
                        </div>
                        <p className="text-4xl font-black text-white">{unitsInventory.availableCount}</p>
                     </div>
                  </div>
               </div>

               <div className="relative w-72 h-72 mx-8">
                  <svg className="w-full h-full transform -rotate-90">
                     <circle cx="144" cy="144" r="90" stroke="#1e293b" strokeWidth="16" fill="transparent" />
                     <circle cx="144" cy="144" r="90" stroke="#3b82f6" strokeWidth="16" fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                     <span className="text-6xl font-black text-white">{salesPerformance.toFixed(0)}%</span>
                     <span className="text-slate-400 text-base font-medium mt-2">Conversão</span>
                  </div>
               </div>

               <div className="flex flex-col gap-5">
                  <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-green-500 group">
                     <div>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Faturado</span>
                        <p className="text-2xl font-black text-white mt-1">{formatCurrency(unitsInventory.realizedValue)}</p>
                     </div>
                  </div>
                  <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-purple-500 group">
                     <div>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Potencial</span>
                        <p className="text-2xl font-black text-white mt-1">{formatCurrency(unitsInventory.totalPotentialSale)}</p>
                     </div>
                  </div>
               </div>
            </div>

            <div className="px-8">
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {projects.map(p => (
                     <div key={p.id} onClick={() => onSelectProject?.(p.id)} className="bg-slate-800 p-6 rounded-3xl cursor-pointer hover:bg-slate-700 transition">
                        <p className="text-white font-bold text-lg">{p.name}</p>
                        <div className="mt-4 w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                           <div className="h-full bg-blue-500" style={{ width: `${p.progress}%` }} />
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>

         {showModal && modalRoot && ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
               <div className="bg-slate-800 rounded-3xl p-6 w-full max-w-md">
                  <h2 className="text-xl font-black text-white mb-6">{editingProject ? 'Editar Obra' : 'Nova Obra'}</h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                     <input required type="text" className="w-full p-4 bg-slate-900 text-white rounded-xl" placeholder="Nome" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                     <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold uppercase">Salvar</button>
                     <button type="button" onClick={() => setShowModal(false)} className="w-full py-2 text-slate-400">Cancelar</button>
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
            title="Excluir Obra?"
            message="Confirmar exclusão irrevogável?"
            confirmText="Sim, Excluir"
            cancelText="Cancelar"
            variant="danger"
         />
      </div>
   );
};

export default GeneralDashboard;
