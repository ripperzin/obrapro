/**
 * Conferência dos números do empreendimento (lucro, custo por casa, rateio).
 *
 *   npm run check:finance
 *
 * Por que existe: estes são os números que vão para o sócio no app, no link e no
 * PDF. Um erro aqui não trava nada — só mostra lucro que não existe. Foi o que
 * aconteceu com a OBRA 31 (lucro de R$ 450.000 e margem de 100% quando o certo
 * era R$ 92.000 e 20,4%), e ninguém percebeu lendo o código.
 *
 * Ao mexer em projectFinance.ts, rode isto antes de commitar.
 */
import { computeProjectFinance, computeUnitResult } from './projectFinance';
import { Project, Unit } from '../types';

let falhas = 0;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const perto = (a: number, b: number) => Math.abs(a - b) < 0.01;

const check = (nome: string, real: number, esperado: number, fmt: (n: number) => string = brl) => {
    const ok = perto(real, esperado);
    if (!ok) falhas++;
    console.log(`   ${ok ? 'OK  ' : 'FALHOU'} ${nome}: ${fmt(real)}${ok ? '' : `   (esperado ${fmt(esperado)})`}`);
};

const obra = (over: Partial<Project>): Project => ({
    id: 'x', name: 'teste', progress: 0, units: [], expenses: [],
    contributions: [], acquisitionCosts: [], investors: [], profitShares: [],
    ...over,
} as unknown as Project);

const casa = (over: Partial<Unit>): Unit => ({ id: Math.random().toString(), area: 0, cost: 0, status: 'Available', ...over } as unknown as Unit);
const despesa = (value: number) => ({ id: Math.random().toString(), value } as any);

// ---------------------------------------------------------------------------
console.log('\n1. OBRA 31 (dados reais: 2 casas SEM metragem, concluída, vendidas)');
const obra31 = obra({
    progress: 100,
    units: [
        casa({ identifier: 'CASA 01', area: 0, cost: 179000, status: 'Sold', saleValue: 225000 }),
        casa({ identifier: 'CASA 2', area: 0, cost: 179000, status: 'Sold', saleValue: 225000 }),
    ],
    expenses: [despesa(358000)],
});
const f31 = computeProjectFinance(obra31);
check('custo das vendidas', f31.custoRealVendidas, 358000);
check('lucro real', f31.lucroReal, 92000);
check('margem real', f31.margemRealPct, 20.444444, (n) => n.toFixed(2) + '%');
console.log(`   (antes do conserto: custo ${brl(0)}, lucro ${brl(450000)}, margem 100,00%)`);

// ---------------------------------------------------------------------------
console.log('\n2. REGRESSÃO — casas COM metragem continuam rateando por m²');
const comArea = obra({
    progress: 100,
    units: [
        casa({ area: 100, cost: 200000, status: 'Sold', saleValue: 400000 }),
        casa({ area: 50, cost: 100000, status: 'Available', valorEstimadoVenda: 200000 }),
    ],
    expenses: [despesa(300000)],
});
const fArea = computeProjectFinance(comArea);
// casa vendida = 100/150 = 2/3 do gasto de 300.000 = 200.000
check('custo da vendida (2/3 do gasto)', fArea.custoRealVendidas, 200000);
check('lucro real', fArea.lucroReal, 200000);

// ---------------------------------------------------------------------------
console.log('\n3. Terreno também segue a mesma régua (casa sem metragem não pega terreno de graça)');
const comTerreno = obra({
    progress: 100,
    units: [
        casa({ area: 0, cost: 100000, status: 'Sold', saleValue: 300000 }),
        casa({ area: 0, cost: 100000, status: 'Available' }),
    ],
    expenses: [despesa(200000)],
    acquisitionCosts: [{ id: 't', value: 100000 } as any],
});
const fTerreno = computeProjectFinance(comTerreno);
// metade de (200.000 gasto + 100.000 terreno) = 150.000
check('custo da vendida (metade de obra+terreno)', fTerreno.custoRealVendidas, 150000);
check('lucro real', fTerreno.lucroReal, 150000);

// ---------------------------------------------------------------------------
console.log('\n4. Obra marcada 100% mas SEM despesa lançada → não pode dar lucro cheio');
const semDespesa = obra({
    progress: 100,
    units: [casa({ area: 0, cost: 100000, status: 'Sold', saleValue: 150000 })],
    expenses: [],
});
const fSem = computeProjectFinance(semDespesa);
check('custo das vendidas (cai no orçado)', fSem.custoRealVendidas, 100000);
check('lucro real', fSem.lucroReal, 50000);
console.log(`   ${fSem.custoRealEstimado ? 'OK  ' : 'FALHOU'} marcado como estimado: ${fSem.custoRealEstimado}`);
if (!fSem.custoRealEstimado) falhas++;

// ---------------------------------------------------------------------------
console.log('\n5. Soma das casas TEM que fechar com o total do empreendimento');
const soma = obra31.units!.filter((u) => u.status === 'Sold')
    .reduce((s, u) => s + computeUnitResult(obra31, u).custoRealizado, 0);
check('soma das casas × custo das vendidas', soma, f31.custoRealVendidas);

// ---------------------------------------------------------------------------
console.log('\n6. Metragem faltando em ALGUMA casa → divide igual (não mistura régua)');
const misto = obra({
    progress: 100,
    units: [
        casa({ area: 100, cost: 100000, status: 'Sold', saleValue: 300000 }),
        casa({ area: 0, cost: 100000, status: 'Sold', saleValue: 300000 }),
    ],
    expenses: [despesa(200000)],
});
const fMisto = computeProjectFinance(misto);
// as duas vendidas: fatia 1/2 + 1/2 = 1 → custo = gasto inteiro
check('custo das vendidas (as duas = gasto inteiro)', fMisto.custoRealVendidas, 200000);
check('lucro real', fMisto.lucroReal, 400000);
const somaMisto = misto.units!.reduce((s, u) => s + computeUnitResult(misto, u).custoRealizado, 0);
check('soma das casas fecha com o gasto', somaMisto, 200000);
// CASA A CASA: no total as fatias se compensavam e o erro passava batido. É aqui
// que a casa sem metragem levava custo ZERO e aparecia com a venda toda de lucro
// na aba Unidades / divisão por sócio.
const semMetragem = computeUnitResult(misto, misto.units![1]);
check('casa SEM metragem: custo (metade do gasto)', semMetragem.custoRealizado, 100000);
check('casa SEM metragem: resultado', semMetragem.resultado, 200000);
const comMetragem = computeUnitResult(misto, misto.units![0]);
check('casa COM metragem: custo (metade do gasto)', comMetragem.custoRealizado, 100000);

// ---------------------------------------------------------------------------
console.log('\n7. Obra sem casa nenhuma não pode quebrar (divisão por zero)');
const vazia = obra({ progress: 100, units: [], expenses: [despesa(50000)] });
const fVazia = computeProjectFinance(vazia);
check('custo das vendidas', fVazia.custoRealVendidas, 0);
check('lucro real', fVazia.lucroReal, 0);

console.log(falhas === 0 ? '\n==> TODOS OS TESTES PASSARAM\n' : `\n==> ${falhas} TESTE(S) FALHARAM\n`);
process.exit(falhas === 0 ? 0 : 1);
