
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

   console.log('DEBUG ROI:', {
      inflationRate,
      avgMonthlyRoi,
      avgRealMonthlyRoi,
      soldUnitsCount,
      totalMonthlyRoi
   });

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
         {/* ===== MOBILE LAYOUT ===== */}
         <div className="block md:hidden space-y-4">

            {/* Resumo Geral - Layout Clean sem bordas extras */}
            <div className="space-y-4 px-1">
               <div className="flex justify-between items-end mb-2 px-2">
                  <h2 className="text-white font-bold text-lg">Resumo Geral</h2>
                  <span className="text-slate-400 text-xs">{formattedDate}</span>
               </div>

               {/* Row 1: Sales & Stock (Square Grid) */}
               <div className="grid grid-cols-2 gap-2">
                  {/* Sales - Green Theme */}
                  <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-2 opacity-20">
                        <i className="fa-solid fa-check-circle text-4xl text-green-500 transform rotate-12"></i>
                     </div>
                     <i className="fa-solid fa-house-circle-check text-green-400 text-2xl mb-1"></i>
                     <p className="text-white font-black text-3xl">{unitsInventory.soldCount}</p>
                     <p className="text-green-400 text-[10px] font-bold uppercase tracking-widest">Vendidas</p>
                  </div>

                  {/* Stock - Orange Theme */}
                  <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-2 opacity-20">
                        <i className="fa-solid fa-box-open text-4xl text-orange-500 transform rotate-12"></i>
                     </div>
                     <i className="fa-solid fa-key text-orange-400 text-2xl mb-1"></i>
                     <p className="text-white font-black text-3xl">{unitsInventory.availableCount}</p>
                     <p className="text-orange-400 text-[10px] font-bold uppercase tracking-widest">Estoque</p>
                  </div>
               </div>

               {/* Row 2: Revenue (Horizontal) */}
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

               {/* Row 3: Potential (Horizontal) */}
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

               {/* Row 4: Margins (Square Grid) */}
               <div className="grid grid-cols-2 gap-3">
                  {/* Avg Margin */}
                  <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                     <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Margem Média</p>
                     <p className="text-green-400 font-black text-2xl">{(avgRoi * 100).toFixed(0)}%</p>
                     <div className="w-12 h-1 bg-green-500/30 rounded-full mt-1"></div>
                  </div>

                  {/* Monthly Margin */}
                  <div className="bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                     <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Margem Real (a.m.)</p>
                     <p className="text-blue-400 font-black text-2xl">{(avgRealMonthlyRoi * 100).toFixed(1)}%</p>
                     <div className="w-12 h-1 bg-blue-500/30 rounded-full mt-1"></div>
                  </div>
               </div>

               {/* Row 5: Conversion (Horizontal) */}
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

         {/* Botão de Despesa Rápida - Mobile */}
         {isAdmin && onAddExpense && projects.length > 0 && (
            <button
               onClick={openExpenseModal}
               className="w-full flex items-center justify-center gap-3 py-4 bg-green-600/20 border border-green-500/40 rounded-2xl text-green-400 hover:bg-green-600/30 transition-all active:scale-[0.98]"
            >
               <i className="fa-solid fa-receipt text-lg"></i>
               <span className="font-black text-sm uppercase tracking-wider">Adicionar Despesa</span>
               <i className="fa-solid fa-chevron-right opacity-50 text-xs"></i>
            </button>
         )}

         {/* Projects List - Mobile Style */}
         <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
               <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                  Seus Projetos
               </h3>
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
                     {/* Project Thumbnail */}
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
                     {/* Project Info */}
                     <div className="flex-1 min-w-0">
                        <p className="text-white font-bold truncate">{p.name}</p>
                        <p className="text-slate-400 text-sm">{sold} de {total} vendidas</p>
                     </div>
                     {/* Progress Ring */}
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

                     {/* Mobile Actions */}
                     {isAdmin && (
                        <div className="flex gap-2 ml-2">
                           <button
                              onClick={(e) => openEditModal(e, p)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-700/50 text-blue-400 rounded-full hover:bg-blue-600 hover:text-white transition"
                           >
                              <i className="fa-solid fa-pen text-xs"></i>
                           </button>
                           <button
                              onClick={(e) => requestDelete(e, p.id)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-700/50 text-red-400 rounded-full hover:bg-red-600 hover:text-white transition"
                           >
                              <i className="fa-solid fa-trash text-xs"></i>
                           </button>
                        </div>
                     )}
                  </div>
               );
            })}
         </div>
      </div>

       {/* ===== DESKTOP LAYOUT (Variação A - Premium Fullscreen) ===== */ }
   <div className="hidden md:block">
      {/* Header with Greeting */}
      <div className="mb-8">
         <h1 className="text-5xl font-black text-white italic tracking-tight">
            Olá, {userName}!
         </h1>
         <p className="text-slate-400 text-lg mt-2">
            Hoje: {formattedDate}
         </p>
      </div>

      {/* Main Grid: Cards + Conversion Ring - LARGER */}
      <div className="flex gap-8 items-center justify-center mb-12">
         {/* Left Column: 2 Cards */}
         <div className="flex flex-col gap-5">
            {/* Card Vendidas - Blue */}
            <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-blue-500 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all group">
               <div className="flex justify-between items-start">
                  <div>
                     <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                           <i className="fa-solid fa-house-circle-check text-blue-400 text-sm"></i>
                        </div>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Vendidas</span>
                     </div>
                     <p className="text-4xl font-black text-white tracking-tight mt-1">{unitsInventory.soldCount}</p>
                  </div>
               </div>
               <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity transform rotate-12">
                  <i className="fa-solid fa-house-circle-check text-5xl text-blue-500"></i>
               </div>
            </div>

            {/* Card Disponíveis - Orange */}
            <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-orange-500 hover:shadow-[0_0_30px_rgba(249,115,22,0.15)] transition-all group">
               <div className="flex justify-between items-start">
                  <div>
                     <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                           <i className="fa-solid fa-key text-orange-400 text-sm"></i>
                        </div>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Disponíveis</span>
                     </div>
                     <p className="text-4xl font-black text-white tracking-tight mt-1">{unitsInventory.availableCount}</p>
                  </div>
               </div>
               <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity transform rotate-12">
                  <i className="fa-solid fa-key text-5xl text-orange-500"></i>
               </div>
            </div>
         </div>

         {/* Center: Conversion Ring - LARGER */}
         <div className="relative w-72 h-72 animate-pulse-glow mx-8">
            <svg className="w-full h-full transform -rotate-90">
               <circle cx="144" cy="144" r="90" stroke="#1e293b" strokeWidth="16" fill="transparent" />
               <circle
                  cx="144" cy="144" r="90"
                  stroke="url(#blueGradient)" strokeWidth="16" fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="progress-ring-circle"
               />
               <defs>
                  <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                     <stop offset="0%" stopColor="#38bdf8" />
                     <stop offset="50%" stopColor="#3b82f6" />
                     <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
               </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
               <span className="text-6xl font-black text-white">{salesPerformance.toFixed(0)}%</span>
               <span className="text-slate-400 text-base font-medium mt-2">Conversão</span>
               <span className="text-slate-500 text-sm">de Vendas</span>
            </div>
         </div>

         {/* Right Column: 2 Cards */}
         <div className="flex flex-col gap-5">
            {/* Card Faturado - Green */}
            <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-green-500 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] transition-all group">
               <div className="flex justify-between items-start">
                  <div>
                     <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                           <i className="fa-solid fa-money-bill-trend-up text-green-400 text-sm"></i>
                        </div>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Faturado</span>
                     </div>
                     <p className="text-2xl font-black text-white tracking-tight mt-1 truncate max-w-[200px]" title={formatCurrency(unitsInventory.realizedValue)}>
                        {formatCurrency(unitsInventory.realizedValue)}
                     </p>
                  </div>
               </div>
               <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity transform rotate-12">
                  <i className="fa-solid fa-coins text-5xl text-green-500"></i>
               </div>
            </div>

            {/* Card Potencial - Purple */}
            <div className="w-64 h-32 rounded-2xl p-5 relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-700/50 border-l-4 border-l-purple-500 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-all group">
               <div className="flex justify-between items-start">
                  <div>
                     <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                           <i className="fa-solid fa-chart-line text-purple-400 text-sm"></i>
                        </div>
                        <span className="text-slate-400 font-bold text-xs uppercase tracking-wider">Potencial</span>
                     </div>
                     <p className="text-2xl font-black text-white tracking-tight mt-1 truncate max-w-[200px]" title={formatCurrency(unitsInventory.totalPotentialSale)}>
                        {formatCurrency(unitsInventory.totalPotentialSale)}
                     </p>
                  </div>
               </div>
               <div className="absolute -bottom-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity transform rotate-12">
                  <i className="fa-solid fa-chart-line text-5xl text-purple-500"></i>
               </div>
            </div>
         </div>
      </div>

      {/* Margin Stats Row */}
      <div className="flex gap-4 justify-center mb-10">
         <div className="glass px-6 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
               <i className="fa-solid fa-percentage text-green-400"></i>
            </div>
            <div>
               <p className="text-green-400 font-black text-xl">{(avgRoi * 100).toFixed(1)}%</p>
               <p className="text-slate-400 text-xs font-medium">Margem Média</p>
            </div>
         </div>
         <div className="glass px-6 py-3 rounded-2xl flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
               <i className="fa-solid fa-calendar-check text-blue-400"></i>
            </div>
            <div>
               <p className="text-blue-400 font-black text-xl">{(avgRealMonthlyRoi * 100).toFixed(1)}%</p>
               <p className="text-slate-400 text-xs font-medium">Margem Real (a.m.)</p>
            </div>
         </div>
      </div>

      {/* Botão de Despesa Rápida - Desktop */}
      {isAdmin && onAddExpense && projects.length > 0 && (
         <div className="flex justify-center mb-10">
            <button
               onClick={openExpenseModal}
               className="flex items-center gap-4 px-8 py-4 bg-gradient-to-r from-green-600/10 to-emerald-600/10 border-2 border-dashed border-green-500/40 rounded-2xl text-green-400 hover:border-green-400 hover:shadow-lg hover:shadow-green-500/20 transition-all group"
            >
               <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <i className="fa-solid fa-receipt text-xl"></i>
               </div>
               <div className="text-left">
                  <p className="font-black text-lg uppercase tracking-wider">Adicionar Despesa</p>
                  <p className="text-sm text-green-400/60 font-medium">Lançamento rápido nas obras</p>
               </div>
               <i className="fa-solid fa-arrow-right ml-4 opacity-50 group-hover:translate-x-1 transition-transform"></i>
            </button>
         </div>
      )}

      {/* Projects Section - Clickable */}
      <div>
         <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-bold text-xl flex items-center gap-3">
               <i className="fa-solid fa-building text-blue-400"></i>
               Projetos Atuais
            </h3>
            {isAdmin && onAddProject && (
               <button
                  onClick={openAddModal}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-bold flex items-center gap-2"
               >
                  <i className="fa-solid fa-plus"></i>
                  Nova Obra
               </button>
            )}
         </div>

         {projects.length === 0 ? (
            <div className="glass rounded-3xl p-16 text-center">
               <i className="fa-solid fa-helmet-safety text-6xl mb-6 text-slate-600"></i>
               <p className="text-slate-400 font-bold text-lg">Nenhuma obra encontrada.</p>
               <p className="text-slate-500 mt-2">Clique em "Nova Obra" para começar!</p>
            </div>
         ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-5">
               {projects.map(p => {
                  const sold = p.units.filter(u => u.status === 'Sold').length;
                  const total = p.units.length;
                  return (
                     <div
                        key={p.id}
                        onClick={() => onSelectProject?.(p.id)}
                        className="glass rounded-2xl overflow-hidden card-hover cursor-pointer group active:scale-[0.98] transition-all"
                     >
                        {/* Project Image Placeholder */}
                        {(() => {
                           const evidencesWithPhotos = (p.stageEvidence || [])
                              .filter(e => e.photos && e.photos.length > 0)
                              .sort((a, b) => b.stage - a.stage);
                           const latestEvidence = evidencesWithPhotos[0];
                           const photo = latestEvidence?.photos?.[0];

                           return (
                              <div className="h-36 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative overflow-hidden">
                                 {photo ? (
                                    <StageThumbnail photoPath={photo} className="w-full h-full" />
                                 ) : (
                                    <i className="fa-solid fa-city text-5xl text-slate-600 group-hover:scale-110 transition-transform"></i>
                                 )}
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                                 {/* Hover overlay */}
                                 <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition-colors flex items-center justify-center">
                                    <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                       Ver Detalhes →
                                    </span>
                                 </div>

                                 {/* Desktop Actions Overlay */}
                                 {isAdmin && (
                                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                       <button
                                          onClick={(e) => openEditModal(e, p)}
                                          className="w-8 h-8 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition shadow-lg border border-slate-700"
                                          title="Editar Obra"
                                       >
                                          <i className="fa-solid fa-pen text-xs"></i>
                                       </button>
                                       <button
                                          onClick={(e) => requestDelete(e, p.id)}
                                          className="w-8 h-8 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition shadow-lg border border-slate-700"
                                          title="Excluir Obra"
                                       >
                                          <i className="fa-solid fa-trash text-xs"></i>
                                       </button>
                                    </div>
                                 )}
                              </div>
                           );
                        })()}
                        <div className="p-5">
                           <p className="text-white font-bold text-lg truncate">{p.name}</p>
                           <div className="flex items-center justify-between mt-2">
                              <span className="text-slate-400 text-sm">{sold}/{total} vendidas</span>
                              <span className="text-blue-400 font-bold">{p.progress}%</span>
                           </div>
                           <div className="mt-3 w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div
                                 className="h-full rounded-full transition-all duration-700"
                                 style={{
                                    width: `${p.progress}%`,
                                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
                                 }}
                              />
                           </div>
                        </div>
                     </div>
                  );
               })}
            </div>
         )}
      </div>
   </div>

   {/* Modal Nova Obra */ }
   {
      showModal && modalRoot && ReactDOM.createPortal(
         <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in border border-slate-700">
               <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-900/95 sticky top-0 z-10">
                  <h2 className="text-xl font-black text-white">{editingProject ? 'Editar Obra' : 'Nova Obra'}</h2>
                  <button
                     onClick={() => setShowModal(false)}
                     className="w-10 h-10 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full text-slate-400 hover:text-red-400 hover:border-red-400 transition"
                  >
                     <i className="fa-solid fa-xmark"></i>
                  </button>
               </div>
               <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  <div className="space-y-3">
                     <label className="text-xs font-black text-blue-400 uppercase tracking-widest ml-4">
                        Nome do Empreendimento
                     </label>
                     <input
                        required
                        type="text"
                        className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-white shadow-sm text-sm placeholder-slate-500"
                        placeholder="Ex: Residencial Aurora"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                     />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                           Início
                        </label>
                        <DateInput
                           value={formData.startDate}
                           onChange={(val) => setFormData({ ...formData, startDate: val })}
                           className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-medium text-white text-sm text-center"
                           placeholder="DD/MM/AAAA"
                        />
                     </div>
                     <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
                           Entrega
                        </label>
                        <DateInput
                           value={formData.deliveryDate}
                           onChange={(val) => setFormData({ ...formData, deliveryDate: val })}
                           className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-blue-500 rounded-xl outline-none transition-all font-medium text-white text-sm text-center"
                           placeholder="DD/MM/AAAA"
                        />
                     </div>
                  </div>
                  <button
                     type="submit"
                     className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest"
                  >
                     {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                  </button>
               </form>
            </div>
         </div>,
         modalRoot
      )
   }

   {/* Modal Despesa Rápida (Reutilizável) */ }
          <QuickExpenseModal
             isOpen={showExpenseModal}
             onClose={() => setShowExpenseModal(false)}
             projects={projects}
             preSelectedProjectId={expenseFormData.projectId}
             onSave={(pid, expense) => {
                if (onAddExpense) {
                   onAddExpense(pid, expense);
                }
             }}
          />

         <ConfirmModal
            isOpen={!!projectToDelete}
            onClose={() => setProjectToDelete(null)}
            onConfirm={handleConfirmDelete}
            title="Excluir Obra?"
            message="Tem certeza que deseja excluir esta obra? Todas as unidades, despesas e históricos associados serão perdidos permanentemente."
            confirmText="Sim, Excluir"
            cancelText="Cancelar"
            variant="danger"
         />
      </div >
   );
};

export default GeneralDashboard;
