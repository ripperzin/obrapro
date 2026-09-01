import React from 'react';
import { AcquisitionCost, Project, ACQUISITION_CATEGORY_LABELS, AcquisitionCategory } from '../types';
import { formatCurrency } from '../utils';
import { openAttachment } from '../utils/storage';

// O terreno passa a aparecer NA MESMA LISTA das despesas (pedido do Wender), como
// etapa "Terreno" + item (a categoria: compra, escritura, registro, comissão…).
//
// ⚠️ O DADO NÃO MUDA DE GAVETA: continua em `acquisition_costs`. A etapa é só de
// TELA. É isso que mantém `gasto` (utils/projectFinance.ts) intocado — e com ele o
// custo por m², o Gasto×Avanço, o rateio por casa, a margem e o acerto de aportes.
// Se algum dia o terreno virar linha de `expenses`, tudo isso passa a somar terra
// como se fosse obra construída.
//
// PERMUTA fica FORA daqui: terreno pago com casas não é dinheiro que saiu, então
// não é lançamento — vira a faixa escrita (FaixaPermuta abaixo).

export const catLabel = (c: string) =>
    ACQUISITION_CATEGORY_LABELS[c as AcquisitionCategory] || c;

/** O que a linha mostra como descrição. O campo é opcional e quase sempre vem
 *  vazio (as 3 parcelas da São Caetano estão em branco no banco); sem isto a
 *  lista ficaria com linhas mudas e idênticas. */
export const terrenoDescricao = (c: AcquisitionCost) =>
    (c.description || '').trim() || catLabel(c.category);

const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '');

const investorName = (project: Project, id?: string) =>
    (project.investors || []).find((i) => i.id === id)?.name;

/** Etiqueta de como foi pago — a mesma informação que o card de Terreno já dava. */
const ComoPagou: React.FC<{ c: AcquisitionCost; project: Project }> = ({ c, project }) => {
    if (c.paidByInvestorId) {
        return (
            <span className="ml-2 text-[9px] uppercase tracking-wider bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                aporte de {investorName(project, c.paidByInvestorId) || 'sócio'}
            </span>
        );
    }
    if (!c.paidFromProject) {
        return <span className="ml-2 text-[9px] uppercase tracking-wider bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded whitespace-nowrap">fora do caixa</span>;
    }
    return null;
};

const EtiquetaEtapa = () => (
    <span className="text-[9px] uppercase tracking-wider bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded font-bold whitespace-nowrap">
        <i className="fa-solid fa-map-location-dot mr-1"></i>Terreno
    </span>
);

interface RowProps {
    c: AcquisitionCost;
    project: Project;
    onEdit: (c: AcquisitionCost) => void;
    onDelete: (c: AcquisitionCost) => void;
    podeMexer: boolean;
}

/** Celular: card, no mesmo formato do card de despesa. */
export const TerrenoCard: React.FC<RowProps> = ({ c, project, onEdit, onDelete, podeMexer }) => (
    <div className="glass rounded-2xl p-5 border border-amber-500/25 bg-amber-500/[0.03]">
        <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <EtiquetaEtapa />
                    <span className="text-[10px] text-slate-400 font-bold">› {catLabel(c.category)}</span>
                </div>
                <p className="text-white font-bold break-words">{terrenoDescricao(c)}</p>
                <p className="text-slate-500 text-xs mt-1">
                    {fmtDate(c.date)}
                    <ComoPagou c={c} project={project} />
                </p>
            </div>
            <div className="text-right shrink-0">
                <p className="text-amber-400 font-black text-lg whitespace-nowrap">{formatCurrency(c.value)}</p>
                <div className="flex items-center gap-3 justify-end mt-2">
                    {!!c.attachments?.length && (
                        <button onClick={() => openAttachment(c.attachments![0])} className="text-blue-400 hover:text-blue-300" title="Ver comprovante">
                            <i className="fa-solid fa-paperclip"></i>
                        </button>
                    )}
                    {podeMexer && (
                        <>
                            <button onClick={() => onEdit(c)} className="text-slate-500 hover:text-amber-400" title="Editar"><i className="fa-solid fa-pen"></i></button>
                            <button onClick={() => onDelete(c)} className="text-slate-500 hover:text-rose-400" title="Excluir"><i className="fa-solid fa-trash"></i></button>
                        </>
                    )}
                </div>
            </div>
        </div>
    </div>
);

/** Computador: linha da tabela. Colunas: Data · Descrição · Etapa · [Item] · Autor · Valor · [Ações] */
export const TerrenoTr: React.FC<RowProps & { mostrarItem: boolean; mostrarAcoes: boolean }> = ({
    c, project, onEdit, onDelete, podeMexer, mostrarItem, mostrarAcoes,
}) => (
    <tr className="bg-amber-500/[0.04] hover:bg-amber-500/[0.07] transition">
        <td className="px-4 py-4 w-36"><span className="font-bold text-slate-300">{fmtDate(c.date)}</span></td>
        <td className="px-4 py-4">
            <span className="font-bold text-white">{terrenoDescricao(c)}</span>
            <ComoPagou c={c} project={project} />
            {!!c.attachments?.length && (
                <button onClick={() => openAttachment(c.attachments![0])} className="text-blue-400 hover:text-blue-300 ml-2" title="Ver comprovante">
                    <i className="fa-solid fa-paperclip"></i>
                </button>
            )}
        </td>
        <td className="px-4 py-4"><EtiquetaEtapa /></td>
        {mostrarItem && <td className="px-4 py-4 text-slate-400 text-xs">{catLabel(c.category)}</td>}
        <td className="px-4 py-4 text-slate-500 text-xs">{c.userName || '—'}</td>
        <td className="px-4 py-4 text-right text-amber-400 font-black whitespace-nowrap">{formatCurrency(c.value)}</td>
        {mostrarAcoes && (
            <td className="px-4 py-4 text-center whitespace-nowrap">
                {podeMexer && (
                    <>
                        <button onClick={() => onEdit(c)} className="text-slate-500 hover:text-amber-400 mx-1.5" title="Editar"><i className="fa-solid fa-pen"></i></button>
                        <button onClick={() => onDelete(c)} className="text-slate-500 hover:text-rose-400 mx-1.5" title="Excluir"><i className="fa-solid fa-trash"></i></button>
                    </>
                )}
            </td>
        )}
    </tr>
);

/** A permuta NÃO é lançamento — não saiu dinheiro. Vira uma frase escrita em cima
 *  da lista, e as casas seguem marcadas com status "Permuta". Assim a lista fecha:
 *  todo valor que aparece nela foi pago, e a soma bate com a coluna. */
export const FaixaPermuta: React.FC<{ project: Project; permutas: AcquisitionCost[] }> = ({ project, permutas }) => {
    if (!permutas.length) return null;
    const total = permutas.reduce((s, c) => s + (c.value || 0), 0);
    const casas = (project.units || []).filter((u) => u.status === 'Permuta');
    const nomes = casas.map((u) => u.identifier).filter(Boolean);

    return (
        <div className="flex gap-3 items-start bg-amber-500/[0.07] border border-amber-500/30 rounded-2xl px-4 py-3">
            <i className="fa-solid fa-handshake text-amber-400 mt-0.5"></i>
            <div className="text-sm min-w-0">
                <p className="text-amber-200 font-bold">
                    {casas.length > 0
                        ? `Este terreno foi pago com ${casas.length === 1 ? '1 casa' : `${casas.length} casas`}${nomes.length ? ` — ${nomes.join(', ')}` : ''}.`
                        : 'Este terreno foi pago com casas.'}
                </p>
                <p className="text-slate-400 text-xs mt-0.5">
                    Valor acordado {formatCurrency(total)} · não saiu do caixa, então não entra na lista nem na soma.
                </p>
            </div>
        </div>
    );
};
