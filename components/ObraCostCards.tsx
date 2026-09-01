import React from 'react';
import { Project } from '../types';
import { formatCurrency } from '../utils';
import { computeProjectFinance } from '../utils/projectFinance';

interface Props {
  project: Project;
}

// Valor SEMPRE por extenso, celular incluído. Nunca quebra linha.
// Mesma correção do card de Caixa (CashSummaryCards): o abreviado arredondava
// pro milhar mais próximo e mostrava um número que não era o da obra. Cabe por
// extenso porque no celular os cards agora vêm 2 por linha.
const Money: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <p className={`font-black leading-none whitespace-nowrap text-sm sm:text-lg md:text-xl ${className}`}>
    {formatCurrency(value)}
  </p>
);

/**
 * Custo da obra (aba Gestão): Construção + Terreno = Custo total.
 * É a visão de CUSTO (quanto a obra custou) — separada do Caixa (fluxo), que vive
 * na aba Sócios. "Terreno" é SÓ o que saiu em dinheiro (aquisicaoCusto); quando
 * houve permuta, ela vira uma LINHA ESCRITA embaixo — nunca soma no custo.
 * No celular os cards vêm 2 por linha (pra caber o valor por extenso); quando há
 * terreno são 3 cards, e o Custo total ocupa a 2ª linha inteira.
 */
const ObraCostCards: React.FC<Props> = ({ project }) => {
  const f = computeProjectFinance(project);
  const construcao = f.gasto;                                  // despesas de obra
  const pagoComCasas = f.aquisicaoTotal - f.aquisicaoCusto;    // permuta (não é dinheiro)
  // ⚠️ Terreno = SÓ o que saiu em dinheiro (`aquisicaoCusto`), nunca `aquisicaoTotal`.
  // Somar a permuta inflava o custo em meio milhão que ninguém pagou (LARANJAIS
  // mostrava "Custo total R$ 797.949,62" onde saíram R$ 247.949,62) e inflava junto
  // o R$/m². Também estava em desacordo com o próprio cálculo do app: o custo
  // rateado por casa já usa `gasto + aquisicaoCusto` (projectFinance.ts).
  // A permuta não some — vira a linha escrita abaixo do valor.
  const terreno = f.aquisicaoCusto;
  const total = construcao + terreno;
  const temPermuta = pagoComCasas > 0.5;
  // Obra que SÓ tem permuta tem terreno em dinheiro = 0, mas o card precisa
  // aparecer mesmo assim — é ele que carrega a explicação da permuta.
  const temTerreno = terreno > 0 || temPermuta;

  // R$/m² REAL (parcial): custo ÷ área das casas. Enquanto a obra não fechou é
  // PARCIAL (sobe conforme gasta). Fica 0 quando não dá pra saber (obra sem a
  // metragem das casas cadastrada) — aí a linha some. Mesma base do card do Caixa.
  const areaTotal = f.areaTotal;
  const m2Construcao = areaTotal > 0 && construcao > 0 ? Math.round((construcao / areaTotal) * 100) / 100 : 0;
  const m2Total = areaTotal > 0 && total > 0 ? Math.round((total / areaTotal) * 100) / 100 : 0;
  const parcial = project.progress >= 100 ? '' : ' (parcial)';

  // COM O TERRENO DA PERMUTA — outra pergunta, outra resposta.
  // `total` acima é dinheiro que saiu (serve pro caixa e pra margem). Este aqui é
  // "quanto esta obra custaria se a terra tivesse sido comprada", que é o único
  // jeito de comparar o m² dela com o de uma obra onde a terra foi paga em dinheiro
  // — sem ele a obra de permuta parece barata de mentira.
  // ⚠️ NÃO usar pra lucro/margem: o custo de construir as casas dadas já está em
  // `construcao`, então somar o valor da terra aqui a contaria 2× no resultado.
  const totalComTerra = construcao + f.aquisicaoTotal;
  const m2ComTerra = areaTotal > 0 && totalComTerra > 0 ? Math.round((totalComTerra / areaTotal) * 100) / 100 : 0;

  const cardBase = 'glass rounded-xl md:rounded-2xl p-2.5 md:p-5 border border-slate-700 min-w-0';
  const label = 'text-[8px] md:text-[10px] font-black uppercase tracking-wider md:tracking-widest text-slate-400 truncate';

  return (
    <div className={`grid grid-cols-2 ${temTerreno ? 'sm:grid-cols-3' : ''} gap-2 md:gap-4`}>
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
          {/* A permuta aparece AQUI, e no celular também: era `hidden md:block`,
              então no telefone o valor ficava sozinho sem nada que o explicasse —
              e abreviado ("550k"), que é justamente o que já mordeu duas vezes. */}
          {temPermuta && (
            <p className="text-[8px] md:text-[9px] text-amber-400/80 mt-1 font-bold uppercase tracking-wider leading-tight">
              <i className="fa-solid fa-handshake mr-1"></i>
              + {formatCurrency(pagoComCasas)} pagos com casas
            </p>
          )}
        </div>
      )}

      {/* Custo total */}
      <div className={`glass rounded-xl md:rounded-2xl p-2.5 md:p-5 border border-blue-500/40 min-w-0 ${temTerreno ? 'col-span-2 sm:col-span-1' : ''}`}>
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
        {/* Só em obra de permuta: o custo "como se a terra tivesse sido comprada",
            que é o número comparável com as outras obras. Aparece no celular também. */}
        {temPermuta && (
          <p className="text-[8px] md:text-[9px] text-slate-400 mt-1.5 pt-1.5 border-t border-slate-700/70 font-bold uppercase tracking-wider leading-tight">
            <i className="fa-solid fa-scale-balanced mr-1 text-amber-400/80"></i>
            com o terreno: {formatCurrency(totalComTerra)}
            {m2ComTerra > 0 && <span className="block mt-0.5 text-slate-500">{formatCurrency(m2ComTerra)}/m²{parcial}</span>}
          </p>
        )}
      </div>
    </div>
  );
};

export default ObraCostCards;
