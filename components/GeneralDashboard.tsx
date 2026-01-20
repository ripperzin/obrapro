
import React, { useState } from 'react';
import { Project, ProgressStage } from '../types';
import { formatCurrency, calculateMonthsBetween } from '../utils';

interface GeneralDashboardProps {
   projects: Project[];
   userName?: string;
   onSelectProject?: (id: string) => void;
   onAddProject?: (project: any) => void;
   isAdmin?: boolean;
}

const GeneralDashboard: React.FC<GeneralDashboardProps> = ({
   projects,
   userName = 'Usuário',
   onSelectProject,
   onAddProject,
   isAdmin = false
}) => {
   const [showModal, setShowModal] = useState(false);
   const [formData, setFormData] = useState({ name: '' });

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

   const avgRoi = soldUnitsCount > 0 ? totalRoi / soldUnitsCount : 0;
   const avgMonthlyRoi = soldUnitsCount > 0 ? totalMonthlyRoi / soldUnitsCount : 0;

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

   const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (onAddProject) {
         onAddProject({
            name: formData.name,
            unitCount: 0,
            totalArea: 0,
            expectedTotalCost: 0,
            expectedTotalSales: 0,
            progress: ProgressStage.PLANNING
         });
      }
      setShowModal(false);
      setFormData({ name: '' });
   };

   return (
      <div className="animate-fade-in min-h-full">
         {/* ===== MOBILE LAYOUT (Variação C - Estilo App Banco) ===== */}
         <div className="block md:hidden space-y-6">
            {/* Resumo Geral Card - Glassmorphism */}
            <div className="glass rounded-3xl p-6">
               <h2 className="text-white font-bold text-lg mb-4">Resumo Geral</h2>
               <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                     <div className="w-10 h-10 mx-auto bg-blue-500/20 rounded-xl flex items-center justify-center mb-2">
                        <i className="fa-solid fa-house-circle-check text-blue-400"></i>
                     </div>
                     <p className="text-white font-bold text-lg">{unitsInventory.soldCount}</p>
                     <p className="text-slate-400 text-[10px] font-medium">Vendidas</p>
                  </div>
                  <div className="text-center">
                     <div className="w-10 h-10 mx-auto bg-orange-500/20 rounded-xl flex items-center justify-center mb-2">
                        <i className="fa-solid fa-key text-orange-400"></i>
                     </div>
                     <p className="text-white font-bold text-lg">{unitsInventory.availableCount}</p>
                     <p className="text-slate-400 text-[10px] font-medium">Estoque</p>
                  </div>
                  <div className="text-center">
                     <div className="w-10 h-10 mx-auto bg-green-500/20 rounded-xl flex items-center justify-center mb-2">
                        <i className="fa-solid fa-money-bill-trend-up text-green-400"></i>
                     </div>
                     <p className="text-white font-bold text-sm">{formatCurrency(unitsInventory.realizedValue).replace('R$', '').trim()}</p>
                     <p className="text-slate-400 text-[10px] font-medium">Faturado</p>
                  </div>
                  <div className="text-center">
                     <div className="w-10 h-10 mx-auto bg-purple-500/20 rounded-xl flex items-center justify-center mb-2">
                        <i className="fa-solid fa-chart-line text-purple-400"></i>
                     </div>
                     <p className="text-white font-bold text-sm">{formatCurrency(unitsInventory.totalPotentialSale).replace('R$', '').trim()}</p>
                     <p className="text-slate-400 text-[10px] font-medium">Potencial</p>
                  </div>
               </div>
            </div>

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
                        className="glass rounded-2xl p-4 flex items-center gap-4 card-hover cursor-pointer active:scale-[0.98] transition-transform"
                     >
                        {/* Project Thumbnail */}
                        <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center shrink-0">
                           <i className="fa-solid fa-building text-2xl text-slate-400"></i>
                        </div>
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
                     </div>
                  );
               })}
            </div>
         </div>

         {/* ===== DESKTOP LAYOUT (Variação A - Premium Fullscreen) ===== */}
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
                  <div className="w-56 h-36 rounded-3xl p-6 card-hover relative overflow-hidden"
                     style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 50%, #1d4ed8 100%)' }}>
                     <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-house-circle-check text-white text-xl"></i>
                     </div>
                     <div className="absolute bottom-6 left-6">
                        <p className="text-5xl font-black text-white">{unitsInventory.soldCount}</p>
                        <p className="text-white/80 font-semibold text-lg">Vendidas</p>
                     </div>
                     <div className="absolute top-2 right-2 opacity-10">
                        <i className="fa-solid fa-home text-6xl text-white"></i>
                     </div>
                  </div>

                  {/* Card Disponíveis - Orange */}
                  <div className="w-56 h-36 rounded-3xl p-6 card-hover relative overflow-hidden"
                     style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #ea580c 100%)' }}>
                     <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-key text-white text-xl"></i>
                     </div>
                     <div className="absolute bottom-6 left-6">
                        <p className="text-5xl font-black text-white">{unitsInventory.availableCount}</p>
                        <p className="text-white/80 font-semibold text-lg">Disponíveis</p>
                     </div>
                     <div className="absolute top-2 right-2 opacity-10">
                        <i className="fa-solid fa-key text-6xl text-white"></i>
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
                  <div className="w-56 h-36 rounded-3xl p-6 card-hover relative overflow-hidden"
                     style={{ background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)' }}>
                     <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-money-bill-trend-up text-white text-xl"></i>
                     </div>
                     <div className="absolute bottom-6 left-6">
                        <p className="text-2xl font-black text-white">{formatCurrency(unitsInventory.realizedValue)}</p>
                        <p className="text-white/80 font-semibold text-lg">Faturado</p>
                     </div>
                     <div className="absolute top-2 right-2 opacity-10">
                        <i className="fa-solid fa-coins text-6xl text-white"></i>
                     </div>
                  </div>

                  {/* Card Potencial - Purple */}
                  <div className="w-56 h-36 rounded-3xl p-6 card-hover relative overflow-hidden"
                     style={{ background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #7c3aed 100%)' }}>
                     <div className="absolute top-4 left-4 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                        <i className="fa-solid fa-chart-line text-white text-xl"></i>
                     </div>
                     <div className="absolute bottom-6 left-6">
                        <p className="text-2xl font-black text-white">{formatCurrency(unitsInventory.totalPotentialSale)}</p>
                        <p className="text-white/80 font-semibold text-lg">Potencial</p>
                     </div>
                     <div className="absolute top-2 right-2 opacity-10">
                        <i className="fa-solid fa-chart-line text-6xl text-white"></i>
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
                     <p className="text-blue-400 font-black text-xl">{(avgMonthlyRoi * 100).toFixed(1)}%</p>
                     <p className="text-slate-400 text-xs font-medium">Margem Mensal</p>
                  </div>
               </div>
            </div>

            {/* Projects Section - Clickable */}
            <div>
               <div className="flex justify-between items-center mb-6">
                  <h3 className="text-white font-bold text-xl flex items-center gap-3">
                     <i className="fa-solid fa-building text-blue-400"></i>
                     Projetos Atuais
                  </h3>
                  {isAdmin && onAddProject && (
                     <button
                        onClick={() => setShowModal(true)}
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
                              <div className="h-36 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center relative overflow-hidden">
                                 <i className="fa-solid fa-city text-5xl text-slate-600 group-hover:scale-110 transition-transform"></i>
                                 <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                                 {/* Hover overlay */}
                                 <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition-colors flex items-center justify-center">
                                    <span className="text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                       Ver Detalhes →
                                    </span>
                                 </div>
                              </div>
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

         {/* Modal Nova Obra */}
         {showModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
               <div className="glass rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in border border-slate-700">
                  <div className="p-6 border-b border-slate-700 flex justify-between items-center">
                     <h2 className="text-xl font-black text-white">Nova Obra</h2>
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
                           onChange={e => setFormData({ name: e.target.value })}
                        />
                     </div>
                     <button
                        type="submit"
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 font-black uppercase text-sm tracking-widest"
                     >
                        Criar Projeto
                     </button>
                  </form>
               </div>
            </div>
         )}
      </div>
   );
};

export default GeneralDashboard;
