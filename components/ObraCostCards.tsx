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

  // R$/m² REAL (parcial): custo ÷ área das casas. Enquanto a obra não fechou é
  // PARCIAL (sobe conforme gasta). Fica 0 quando não dá pra saber (obra sem a
  // metragem das casas cadastrada) — aí a linha some. Mesma base do card do Caixa.
  const areaTotal = f.areaTotal;
  const m2Construcao = areaTotal > 0 && construcao > 0 ? Math.round((construcao / areaTotal) * 100) / 100 : 0;
  const m2Total = areaTotal > 0 && total > 0 ? Math.round((total / areaTotal) * 100) / 100 : 0;
  const parcial = project.progress >= 100 ? '' : ' (parcial)';

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
        {m2Construcao > 0 && (
          <p className="hidden md:block text-[9px] text-slate-400 mt-1 font-bold uppercase tracking-wider whitespace-nowrap">
            <i className="fa-solid fa-ruler-combined mr-1 text-slate-500"></i>
            {formatCurrency(m2Construcao)}/m² real{parcial}
          </p>
        )}
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
        {m2Total > 0 && (
          <p className="hidden md:block text-[9px] text-blue-400/70 mt-1 font-bold uppercase tracking-wider whitespace-nowrap">
            <i className="fa-solid fa-ruler-combined mr-1"></i>
            {formatCurrency(m2Total)}/m² real{parcial}
          </p>
        )}
      </div>
    </div>
  );
};

export default ObraCostCards;
