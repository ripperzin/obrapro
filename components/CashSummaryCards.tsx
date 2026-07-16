import React from 'react';
import { Project } from '../types';
import { formatCurrency, formatCurrencyAbbrev } from '../utils';
import { computeProjectFinance } from '../utils/projectFinance';

interface Props {
  project: Project;
}

// Valor: abreviado (K/M) no celular, cheio no desktop. Nunca quebra linha.
const Money: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <p className={`font-black leading-none whitespace-nowrap ${className}`}>
    <span className="sm:hidden text-sm">{formatCurrencyAbbrev(value)}</span>
    <span className="hidden sm:inline text-lg md:text-xl">{formatCurrency(value)}</span>
  </p>
);

/**
 * Caixa da obra: Aportado (entrou) − Gasto (obra) − Aquisição paga pela obra = Saldo.
 * Todos os cards numa linha só; valores abreviados no celular para não quebrar.
 */
const CashSummaryCards: React.FC<Props> = ({ project }) => {
  const finance = computeProjectFinance(project);
  // Aportado = dinheiro + despesas pagas direto por sócios (aporteViaDespesa).
  // Gasto = total da obra. Saldo = aportadoTotal − gasto − aquisição paga (== saldoCaixa).
  const totalAportado = finance.aportadoTotal;
  const totalGasto = finance.gasto;
  const totalAquisicaoPaga = finance.aquisicaoPaga;
  const saldo = finance.saldoCaixa;
  const saldoPositivo = saldo >= 0;
  const temAquisicao = totalAquisicaoPaga > 0;
  const temAporteViaDespesa = finance.aporteViaDespesa > 0;

  const cardBase = 'glass rounded-xl md:rounded-2xl p-2.5 md:p-5 border border-slate-700 min-w-0';
  const label = 'text-[8px] md:text-[10px] font-black uppercase tracking-wider md:tracking-widest text-slate-400 truncate';

  return (
    <div className={`grid ${temAquisicao ? 'grid-cols-4' : 'grid-cols-3'} gap-2 md:gap-4`}>
      {/* Aportado */}
      <div className={cardBase}>
        <div className="flex items-center gap-1.5 mb-1 md:mb-2">
          <i className="fa-solid fa-hand-holding-dollar text-emerald-400 text-xs hidden sm:inline"></i>
          <span className={label}>Aportado</span>
        </div>
        <Money value={totalAportado} className="text-white" />
        {temAporteViaDespesa && (
          <p className="hidden md:block text-[9px] text-emerald-400/70 mt-1 font-bold uppercase tracking-wider whitespace-nowrap">
            +{formatCurrencyAbbrev(finance.aporteViaDespesa)} via despesas
          </p>
        )}
      </div>

      {/* Gasto */}
      <div className={cardBase}>
        <div className="flex items-center gap-1.5 mb-1 md:mb-2">
          <i className="fa-solid fa-wallet text-rose-400 text-xs hidden sm:inline"></i>
          <span className={label}>Gasto</span>
        </div>
        <Money value={totalGasto} className="text-white" />
      </div>

      {/* Aquisição (só quando paga pela obra) */}
      {temAquisicao && (
        <div className={cardBase}>
          <div className="flex items-center gap-1.5 mb-1 md:mb-2">
            <i className="fa-solid fa-map-location-dot text-amber-400 text-xs hidden sm:inline"></i>
            <span className={label}>Aquisição</span>
          </div>
          <Money value={totalAquisicaoPaga} className="text-white" />
        </div>
      )}

      {/* Saldo em caixa */}
      <div className={`glass rounded-xl md:rounded-2xl p-2.5 md:p-5 border min-w-0 ${saldoPositivo ? 'border-emerald-500/40' : 'border-rose-500/50'}`}>
        <div className="flex items-center gap-1.5 mb-1 md:mb-2">
          <i className={`fa-solid fa-scale-balanced text-xs hidden sm:inline ${saldoPositivo ? 'text-emerald-400' : 'text-rose-400'}`}></i>
          <span className={label}>
            <span className="sm:hidden">Saldo</span>
            <span className="hidden sm:inline">Saldo em caixa</span>
          </span>
        </div>
        <Money value={saldo} className={saldoPositivo ? 'text-emerald-400' : 'text-rose-400'} />
        {!saldoPositivo && (
          <p className="text-[8px] md:text-[10px] text-rose-400 mt-1 font-bold uppercase tracking-wider whitespace-nowrap">
            <i className="fa-solid fa-triangle-exclamation mr-1"></i>Negativo
          </p>
        )}
      </div>
    </div>
  );
};

export default CashSummaryCards;
