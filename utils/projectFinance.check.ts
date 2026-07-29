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

// ---------------------------------------------------------------------------
// A legenda do link e do PDF promete esta conta ao sócio. Se ela não fechar, o
// sócio soma os cards na mão e acha que o número está errado (ou que sumiu
// dinheiro). O card de Aquisição ficou faltando no link/PDF justamente por isso.
console.log('\n8. Caixa: a conta que o sócio faz na mão TEM que fechar');
const caixa = obra({
    contributions: [{ id: 'c1', value: 500000, investorId: 'i1' } as any],
    expenses: [despesa(250000), { id: 'e2', value: 50000, paidByInvestorId: 'i1' } as any],
    acquisitionCosts: [{ id: 'a1', value: 100000, paidFromProject: true } as any],
});
const fCaixa = computeProjectFinance(caixa);
check('aportado (dinheiro + pago do bolso do sócio)', fCaixa.aportadoTotal, 550000);
check('gasto', fCaixa.gasto, 300000);
check('aquisição paga pela obra', fCaixa.aquisicaoPaga, 100000);
check('saldo em caixa', fCaixa.saldoCaixa, 150000);
check(
    'Aportado - Gasto - Aquisição = Saldo',
    fCaixa.aportadoTotal - fCaixa.gasto - fCaixa.aquisicaoPaga,
    fCaixa.saldoCaixa
);

// ---------------------------------------------------------------------------
// Sócio que paga um custo do terreno do próprio bolso (corretagem, cartório):
// não sai do caixa, mas conta como aporte dele — igual a uma despesa paga do bolso.
console.log('\n9. Terreno pago por um SÓCIO conta como aporte dele (não mexe no caixa)');
const terrenoSocio = obra({
    contributions: [{ id: 'c1', value: 500000, investorId: 'i1' } as any],
    expenses: [despesa(200000)],
    acquisitionCosts: [
        { id: 'a1', value: 100000, paidFromProject: true } as any,               // do caixa
        { id: 'a2', value: 30000, paidFromProject: false, paidByInvestorId: 'i1' } as any, // do bolso do sócio
        { id: 'a3', value: 40000, paidFromProject: false } as any,               // "já era meu" (ninguém pagou agora)
    ],
});
const fTS = computeProjectFinance(terrenoSocio);
check('aquisição paga pelo caixa', fTS.aquisicaoPaga, 100000);
check('aquisição paga por sócio', fTS.aquisicaoViaSocio, 30000);
check('aportado total (dinheiro + terreno do bolso)', fTS.aportadoTotal, 530000);
check('saldo em caixa (só o que passou pelo caixa)', fTS.saldoCaixa, 200000); // 500k - 200k gasto - 100k terreno do caixa
check('aquisição financiada (caixa + sócio, exclui "já era meu")', fTS.aquisicaoFinanciada, 130000);
// A conta do card de caixa: Aportado - Gasto - Aquisição(financiada) = Saldo
check(
    'Aportado - Gasto - Aquisição financiada = Saldo',
    fTS.aportadoTotal - fTS.gasto - fTS.aquisicaoFinanciada,
    fTS.saldoCaixa
);

// ---------------------------------------------------------------------------
// PERMUTA (terreno pago com casas): a casa de permuta puxa CUSTO (construção) mas não
// receita; o terreno pago com casas NÃO é custo em dinheiro (fica só como informação).
// Regra: lucro = receita das VENDIDAS − custo de construir TODAS as casas. Nunca cobra a terra 2×.
console.log('\n10. PERMUTA — 4 casas iguais, casa 4 é permuta do terreno, terreno pago com casas');
const permuta = obra({
    progress: 100,
    units: [
        casa({ identifier: '1', area: 100, cost: 100000, status: 'Sold', saleValue: 200000 }),
        casa({ identifier: '2', area: 100, cost: 100000, status: 'Sold', saleValue: 200000 }),
        casa({ identifier: '3', area: 100, cost: 100000, status: 'Sold', saleValue: 200000 }),
        casa({ identifier: '4', area: 100, cost: 100000, status: 'Permuta' }),
    ],
    expenses: [despesa(400000)], // construiu as 4 casas
    acquisitionCosts: [{ id: 't', value: 300000, paidWithUnits: true } as any], // terreno pago com a casa 4
});
const fP = computeProjectFinance(permuta);
check('aquisição TOTAL (só p/ exibir)', fP.aquisicaoTotal, 300000);
check('aquisição que pesa no custo (terreno pago c/ casa fora)', fP.aquisicaoCusto, 0);
check('custo total do empreendimento (constrói 4, sem terreno em dinheiro)', fP.custoTotalEmpreendimento, 400000);
check('estoque à venda (permuta não é estoque)', fP.vendasPotencial, 0);
check('vendas realizadas (3 casas)', fP.vendasRealizadas, 600000);
check('custo das vendidas (construir TODAS as 4)', fP.custoRealVendidas, 400000);
check('lucro real (600k − 400k, NÃO desconta 300k do terreno)', fP.lucroReal, 200000);
check('lucro projetado bate com o realizado', fP.lucroProjetado, 200000);
check('unidades vendidas', fP.unidadesVendidas, 3, (n) => String(n));
// A soma das casas TEM que fechar com o total (a permuta entra com custo 0 no realizado)
const somaP = permuta.units!.filter((u) => u.status === 'Sold')
    .reduce((s, u) => s + computeUnitResult(permuta, u).custoRealizado, 0);
check('soma das casas vendidas × custo das vendidas', somaP, fP.custoRealVendidas);
const permutaCasa = computeUnitResult(permuta, permuta.units![3]);
check('casa de permuta: fatia 0 → custo realizado 0', permutaCasa.custoRealizado, 0);

// ---------------------------------------------------------------------------
// PERMUTA com venda PARCIAL: sobra 1 casa à venda. O custo de construir a permuta
// se distribui entre as casas que ficam (vendidas + à venda), não some do total.
console.log('\n11. PERMUTA com venda parcial (1 vendida, 1 à venda, 1 permuta)');
const permutaParcial = obra({
    progress: 100,
    units: [
        casa({ identifier: '1', area: 100, cost: 100000, status: 'Sold', saleValue: 300000 }),
        casa({ identifier: '2', area: 100, cost: 100000, status: 'Available', valorEstimadoVenda: 300000 }),
        casa({ identifier: '3', area: 100, cost: 100000, status: 'Permuta' }),
    ],
    expenses: [despesa(300000)], // construiu as 3
    acquisitionCosts: [{ id: 't', value: 200000, paidWithUnits: true } as any],
});
const fPP = computeProjectFinance(permutaParcial);
// base do rateio = 2 casas (1 e 2); cada uma fatia 1/2. A vendida carrega metade do gasto (300k) = 150k.
check('custo da vendida (metade do gasto das 3 casas)', fPP.custoRealVendidas, 150000);
check('lucro real da vendida (300k − 150k)', fPP.lucroReal, 150000);
check('estoque à venda = 1 casa (300k)', fPP.vendasPotencial, 300000);

console.log(falhas === 0 ? '\n==> TODOS OS TESTES PASSARAM\n' : `\n==> ${falhas} TESTE(S) FALHARAM\n`);
process.exit(falhas === 0 ? 0 : 1);
