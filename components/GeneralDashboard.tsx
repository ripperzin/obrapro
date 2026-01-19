
import React from 'react';
import { Project } from '../types';
import { formatCurrency, calculateMonthsBetween } from '../utils';

interface GeneralDashboardProps {
   projects: Project[];
}

const GeneralDashboard: React.FC<GeneralDashboardProps> = ({ projects }) => {
   const unitsInventory = projects.reduce((acc, p) => {
      p.units.forEach(u => {
         // Potencial de Venda agora considera o valorEstimadoVenda (campo novo ou zero)
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

      // Data da primeira despesa do projeto para cálculo de meses
      const firstExpenseDate = project.expenses.length > 0
         ? project.expenses.reduce((min, e) => e.date < min ? e.date : min, project.expenses[0].date)
         : null;

      project.units.forEach(unit => {
         if (unit.status === 'Sold' && unit.saleValue) {
            // Custo Real ou Estimado
            const realCost = (isCompleted && totalUnitsArea > 0)
               ? (unit.area / totalUnitsArea) * totalExpenses
               : unit.cost;

            const costBase = realCost > 0 ? realCost : unit.cost; // Fallback para cost se realCost for 0

            if (costBase > 0) {
               const roi = (unit.saleValue - costBase) / costBase;

               // Cálculo de Meses
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

   return (
      <div className="space-y-10 animate-in fade-in duration-500">
         {/* Top Cards for Inventory & Sales */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="fa-solid fa-house-circle-check text-xl"></i>
               </div>
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Unidades Vendidas</p>
               <p className="text-4xl font-black text-slate-800">{unitsInventory.soldCount}</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="fa-solid fa-money-bill-trend-up text-xl"></i>
               </div>
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Valor Realizado (Vendas)</p>
               <p className="text-3xl font-black text-green-600">{formatCurrency(unitsInventory.realizedValue)}</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="fa-solid fa-key text-xl"></i>
               </div>
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Em Estoque</p>
               <p className="text-4xl font-black text-slate-800">{unitsInventory.availableCount}</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="fa-solid fa-tags text-xl"></i>
               </div>
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Potencial de Venda (Est.)</p>
               <p className="text-3xl font-black text-indigo-600">{formatCurrency(unitsInventory.totalPotentialSale)}</p>
            </div>
         </div>

         {/* Conversion Visual */}
         <div className="bg-slate-900 rounded-[3rem] p-12 text-white overflow-hidden relative">
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
               <div className="shrink-0">
                  <div className="relative w-48 h-48 flex items-center justify-center">
                     <svg className="w-full h-full transform -rotate-90">
                        <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-white/10" />
                        <circle
                           cx="96" cy="96" r="80"
                           stroke="currentColor" strokeWidth="16" fill="transparent"
                           strokeDasharray={502.6}
                           strokeDashoffset={502.6 - (502.6 * salesPerformance / 100)}
                           className="text-blue-500 transition-all duration-1000"
                           strokeLinecap="round"
                        />
                     </svg>
                     <div className="absolute flex flex-col items-center">
                        <span className="text-4xl font-black">{salesPerformance.toFixed(0)}%</span>
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Conversão</span>
                     </div>
                  </div>
               </div>
               <div className="flex-1 space-y-6">
                  <h3 className="text-3xl font-black tracking-tight leading-tight">Métrica Geral de <br /> <span className="text-blue-500">Ocupação e Vendas</span></h3>
                  <p className="text-white/50 font-medium max-w-md">De um total de {totalUnits} unidades construídas em todos os projetos ativos, {unitsInventory.soldCount} já foram comercializadas com sucesso.</p>
                  <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                     <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">MARGEM MÉDIA</p>
                     <p className="font-black text-lg text-green-400">{(avgRoi * 100).toFixed(2)}%</p>
                  </div>
                  <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                     <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">MARGEM MENSAL MÉDIA</p>
                     <p className="font-black text-lg text-green-400">{(avgMonthlyRoi * 100).toFixed(2)}%</p>
                  </div>
               </div>
            </div>
            {/* Decoration */}
            <div className="absolute top-[-20%] right-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"></div>
         </div>

         {/* Simplified Project Summary List */}
         <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10">
            <h4 className="font-black text-slate-800 mb-8 uppercase text-sm tracking-widest flex items-center">
               <i className="fa-solid fa-list-check mr-3 text-blue-600"></i> Resumo por Empreendimento
            </h4>
            <div className="space-y-4">
               {projects.map(p => {
                  const sold = p.units.filter(u => u.status === 'Sold').length;
                  const total = p.units.length;
                  const perc = total > 0 ? (sold / total) * 100 : 0;
                  return (
                     <div key={p.id} className="group p-6 bg-slate-50 hover:bg-blue-50 rounded-3xl border border-transparent hover:border-blue-100 transition-all flex flex-col md:flex-row md:items-center gap-6">
                        <div className="w-48 shrink-0">
                           <p className="font-black text-slate-800 group-hover:text-blue-600 transition-colors">{p.name}</p>
                           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{total} unidades</p>
                        </div>
                        <div className="flex-1 space-y-2">
                           <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-1">
                              <span className="text-slate-400">Vendas</span>
                              <span className="text-blue-600">{sold} / {total}</span>
                           </div>
                           <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-blue-600 h-full transition-all duration-700" style={{ width: `${perc}%` }}></div>
                           </div>
                        </div>
                        <div className="w-32 text-right">
                           <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Progresso</p>
                           <p className="font-black text-slate-800">{p.progress}%</p>
                        </div>
                     </div>
                  )
               })}
            </div>
         </div>
      </div>
   );
};

export default GeneralDashboard;
