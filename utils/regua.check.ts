import { getProjectStages, getStageIndex, getStageName } from '../types';

// As 9 etapas REAIS da RUA DO SORRISO em producao.
const macrosDe = (over: Record<string, number> = {}) => [
    { name: 'Projetos e serviços preliminares', percentage: over['Projetos'] ?? 4, displayOrder: 1, timeBased: false },
    { name: 'Terraplenagem e fundações', percentage: over['Terra'] ?? 11, displayOrder: 2, timeBased: false },
    { name: 'Estrutura e alvenaria', percentage: over['Estrutura'] ?? 22, displayOrder: 3, timeBased: false },
    { name: 'Cobertura e impermeabilização', percentage: over['Cobertura'] ?? 9, displayOrder: 4, timeBased: false },
    { name: 'Instalações elétricas e hidráulicas', percentage: over['Instalacoes'] ?? 14, displayOrder: 5, timeBased: false },
    { name: 'Revestimentos, pisos e forros', percentage: over['Revest'] ?? 17, displayOrder: 6, timeBased: false },
    { name: 'Esquadrias, pintura e acabamentos', percentage: over['Esquadrias'] ?? 14, displayOrder: 7, timeBased: false },
    { name: 'Área externa, ligações e entrega', percentage: over['Externa'] ?? 4, displayOrder: 8, timeBased: false },
    { name: 'Canteiro e custos gerais', percentage: 5, displayOrder: 9, timeBased: true },
];
const obra = (progress: number, over: Record<string, number> = {}) =>
    ({ progress, budget: { macros: macrosDe(over) } }) as any;

// A MESMA conta que o BudgetSection.handleSaveMacroUpdate faz ao salvar o %.
const reancorar = (project: any, over: Record<string, number>) => {
    const idxAntes = getStageIndex(getProjectStages(project), project.progress);
    const stagesDepois = getProjectStages({ budget: { macros: macrosDe(over) } });
    const novo = stagesDepois[idxAntes]?.value;
    if (project.progress < 100 && novo !== undefined && novo !== project.progress) return novo;
    return project.progress;
};

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
    console.log(`  ${cond ? 'PASSA' : 'FALHA'}  ${msg}`);
    if (!cond) falhas++;
};

console.log('=== 1. O BUG (sem reancorar): a obra escorrega sozinha ===');
{
    // 63 = inicio de "Revestimentos" na regua de hoje. E o valor que o proprio stepper
    // grava quando o usuario clica nessa etapa. Nao serve usar 81 aqui: com este
    // cenario 81 continua em Esquadrias nas duas reguas, e o caso nao provaria nada.
    const antes = obra(63);
    const etapaAntes = getStageName(63, antes);
    const depois = obra(63, { Estrutura: 35, Revest: 4 }); // progress FICOU parado em 63
    const etapaDepois = getStageName(63, depois);
    console.log(`  progress 63: "${etapaAntes}" -> personaliza -> "${etapaDepois}"`);
    ok(etapaAntes !== etapaDepois, 'sem reancorar, a etapa MUDA sozinha (o bug existe mesmo)');
    ok(etapaDepois === 'Instalações elétricas e hidráulicas', '...e escorrega para TRAS, uma etapa antes');
}

console.log('');
console.log('=== 2. O CONSERTO: reancorando, a obra fica onde esta ===');
const cenarios: Array<[string, number, Record<string, number>]> = [
    ['Estrutura 22->35, Revest 17->4', 81, { Estrutura: 35, Revest: 4 }],
    ['Estrutura 22->35, Revest 17->4', 63, { Estrutura: 35, Revest: 4 }],
    ['Estrutura 22->30, Revest 17->9', 48, { Estrutura: 30, Revest: 9 }],
    ['Projetos 4->12, Externa 4->0', 16, { Projetos: 12, Externa: 0 }],
    ['Revest 17->25, Esquadrias 14->6', 81, { Revest: 25, Esquadrias: 6 }],
    ['Estrutura 22->35, Revest 17->4', 0, { Estrutura: 35, Revest: 4 }],
];
for (const [desc, prog, over] of cenarios) {
    const p = obra(prog, {});
    const etapaAntes = getStageName(prog, p);
    const novo = reancorar(p, over);
    const etapaDepois = getStageName(novo, obra(novo, over));
    ok(etapaAntes === etapaDepois, `${desc} | progress ${prog}->${novo} | "${etapaAntes}" continua "${etapaDepois}"`);
}

console.log('');
console.log('=== 3. Guardas ===');
{
    const concluida = obra(100);
    ok(reancorar(concluida, { Estrutura: 35, Revest: 4 }) === 100, 'obra concluida (100) nao se reancora');
    const igual = obra(81);
    ok(reancorar(igual, {}) === 81, 'salvar sem mudar o % nao mexe no progresso');
}

console.log('');
console.log('=== 4. O numero SOBE quando as etapas anteriores encarecem (o modelo) ===');
{
    const p = obra(63); // inicio de Revestimentos hoje
    const novo = reancorar(p, { Estrutura: 35, Revest: 4 });
    ok(novo > 63, `Estrutura 22->35 encarece o que ficou para tras: 63 -> ${novo} (sobe, como manda o modelo)`);
}

console.log('');
console.log(falhas === 0 ? '>>> TODAS AS CONFERENCIAS PASSARAM' : `>>> ${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
