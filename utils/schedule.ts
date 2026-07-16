// Cronograma automático: reparte o calendário da obra entre as etapas.
//
// ⚠️ O QUE ESTE CÁLCULO É — E O QUE ELE NÃO É.
// Ele NÃO sabe quanto tempo dura uma fundação. Ele usa o % de CUSTO de cada
// etapa como se fosse % de TEMPO ("a fundação é 11% do dinheiro, então leva 11%
// do prazo"). É um chute de partida, para o usuário não começar com o
// cronograma em branco — e ele ajusta as datas depois. Dinheiro e tempo não
// andam juntos na obra (acabamento é lento e relativamente barato), então o
// resultado é ponto de partida, nunca verdade.
//
// A exceção que este arquivo trata: etapas `timeBased` (canteiro, container,
// água, luz) não são fases — são custos que correm do primeiro ao último dia.
// Elas atravessam a obra inteira, e só as FASES repartem o calendário.

export interface ScheduleMacro {
    id: string;
    percentage?: number;
    displayOrder?: number;
    timeBased?: boolean;
}

export interface ScheduleDates {
    id: string;
    planned_start_date: string;
    planned_end_date: string;
}

const toISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Datas planejadas de cada etapa entre o início e a entrega da obra.
 * Devolve [] se as datas forem inválidas (entrega antes do início) ou se não
 * houver etapas — quem chama decide o que dizer ao usuário.
 */
export const computeScheduleDates = (
    macros: ScheduleMacro[],
    startDate: string,
    endDate: string
): ScheduleDates[] => {
    if (!startDate || !endDate || macros.length === 0) return [];

    const start = new Date(startDate + 'T00:00:00').getTime();
    const end = new Date(endDate + 'T00:00:00').getTime();
    const totalMs = end - start;
    if (!(totalMs > 0)) return [];

    const ordered = [...macros].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

    // Custos que correm a obra inteira: de ponta a ponta, sem consumir calendário.
    const spanning = ordered.filter((m) => m.timeBased);
    const phases = ordered.filter((m) => !m.timeBased);

    const out: ScheduleDates[] = spanning.map((m) => ({
        id: m.id,
        planned_start_date: toISO(start),
        planned_end_date: toISO(end),
    }));

    // Só sobraram custos recorrentes: todos atravessam, não há fase a repartir.
    if (phases.length === 0) return out;

    // Fases repartem o prazo entre si, pelo peso relativo APENAS entre elas
    // (tirar o canteiro da conta não pode encolher a obra).
    const totalPct = phases.reduce((s, m) => s + (m.percentage || 0), 0);
    // Sem % utilizável (tudo zerado): divide o prazo em partes iguais.
    const weight = (m: ScheduleMacro) => (totalPct > 0 ? (m.percentage || 0) / totalPct : 1 / phases.length);

    let cursor = start;
    phases.forEach((m, i) => {
        const mStart = cursor;
        cursor += weight(m) * totalMs;
        // A última fase fecha exatamente na entrega (não deixa sobra de arredondamento).
        const mEnd = i === phases.length - 1 ? end : cursor;
        out.push({ id: m.id, planned_start_date: toISO(mStart), planned_end_date: toISO(mEnd) });
    });

    return out;
};
