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
 * Custo da obra (aba Gestão): Construção + Terreno = Custo total.
 * É a visão de CUSTO (quanto a obra custou) — separada do Caixa (fluxo), que vive
 * na aba Sócios. "Terreno" é o VALOR do terreno + taxas (aquisicaoTotal); quando
 * houve permuta, mostra quanto foi pago com casas × quanto foi em dinheiro.
 */
const ObraCostCards: React.FC<Props> = ({ project }) => {
  const f = computeProjectFinance(project);
  const construcao = f.gasto;                                  // despesas de obra
  const terreno = f.aquisicaoTotal;                            // terreno + taxas (todos)
  const total = construcao + terreno;
  const pagoComCasas = f.aquisicaoTotal - f.aquisicaoCusto;    // permuta (não é dinheiro)
  const terrenoDinheiro = f.aquisicaoCusto;                    // taxas / terreno pago em dinheiro
  const temTerreno = terreno > 0;
  const temPermuta = pagoComCasas > 0.5;

  const cardBase = 'glass rounded-xl md:rounded-2xl p-2.5 md:p-5 border border-slate-700 min-w-0';
  const label = 'text-[8px] md:text-[10px] font-black uppercase tracking-wider md:tracking-widest text-slate-400 truncate';

  return (
    <div className={`grid ${temTerreno ? 'grid-cols-3' : 'grid-cols-2'} gap-2 md:gap-4`}>
      {/* Construção */}
      <div className={cardBase}>
        <div className="flex items-center gap-1.5 mb-1 md:mb-2">
          <i className="fa-solid fa-trowel-bricks text-rose-400 text-xs hidden sm:inline"></i>
          <span className={label}>Construção</span>
        </div>
        <Money value={construcao} className="text-white" />
      </div>

      {/* Terreno (só quando há) */}
      {temTerreno && (
        <div className={cardBase}>
          <div className="flex items-center gap-1.5 mb-1 md:mb-2">
            <i className="fa-solid fa-map-location-dot text-amber-400 text-xs hidden sm:inline"></i>
            <span className={label}>Terreno + taxas</span>
          </div>
          <Money value={terreno} className="text-white" />
          {temPermuta && (
            <p className="hidden md:block text-[9px] text-amber-400/70 mt-1 font-bold uppercase tracking-wider whitespace-nowrap">
              {formatCurrencyAbbrev(pagoComCasas)} com casas · {formatCurrencyAbbrev(terrenoDinheiro)} em dinheiro
            </p>
          )}
        </div>
      )}

      {/* Custo total */}
      <div className="glass rounded-xl md:rounded-2xl p-2.5 md:p-5 border border-blue-500/40 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 md:mb-2">
          <i className="fa-solid fa-calculator text-blue-400 text-xs hidden sm:inline"></i>
          <span className={label}>
            <span className="sm:hidden">Total</span>
            <span className="hidden sm:inline">Custo total</span>
          </span>
        </div>
        <Money value={total} className="text-blue-400" />
      </div>
    </div>
  );
};

export default ObraCostCards;
