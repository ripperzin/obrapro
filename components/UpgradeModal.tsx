import React from 'react';
import ReactDOM from 'react-dom';
import { PlanId } from '../types';

// WhatsApp que recebe os pedidos de upgrade (DDI+DDD, só números).
// Enquanto o checkout do Mercado Pago não existe, o convite abre uma conversa
// com o Victor e a liberação é na mão (profiles.plan).
export const UPGRADE_WHATSAPP = '5567982042203';

/**
 * O que disparou o convite. Quase sempre é um recurso que a pessoa tentou usar;
 * 'geral' é quando ela veio pelo menu, por vontade própria.
 */
export type UpgradeFeature =
  | 'geral'
  | 'itens'
  | 'ocr'
  | 'pdf'
  | 'branding'
  | 'linkCompleto'
  | 'obras'
  | 'socios'
  | 'multiusuario';

// Cabeçalho do convite: fala da coisa que a pessoa acabou de tentar fazer e diz
// QUAL plano resolve (pra destacar o card certo). Regra do item: ANOTAR é grátis,
// a ANÁLISE (previsto × real) é que faz parte do Completo.
type Destaque = 'completo' | 'construtora';
const COPY: Record<UpgradeFeature, { titulo: string; frase: string; icon: string; destaque: Destaque }> = {
  geral: {
    titulo: 'Conheça os planos',
    frase: 'O plano Grátis segura uma obra. Suba pra detalhar o dinheiro item a item, escanear nota e prestar contas pro sócio — e, quando virar empresa, botar a equipe na obra.',
    icon: 'fa-helmet-safety',
    destaque: 'completo',
  },
  itens: {
    titulo: 'A análise por item faz parte do Completo',
    frase: 'Anotar o item já é grátis. No Completo você vê pra onde o dinheiro foi de verdade — cimento, areia, frete — e compara o previsto com o real de cada item.',
    icon: 'fa-boxes-stacked',
    destaque: 'completo',
  },
  ocr: {
    titulo: 'Escanear comprovante faz parte do Completo',
    frase: 'Escaneie a nota com a câmera e o ObraPro preenche o gasto pra você revisar. Menos digitação no fim do dia.',
    icon: 'fa-camera',
    destaque: 'completo',
  },
  pdf: {
    titulo: 'O relatório em PDF faz parte do Completo',
    frase: 'O mesmo relatório do link, em PDF, pronto pra mandar no grupo, imprimir ou anexar na prestação de contas.',
    icon: 'fa-file-pdf',
    destaque: 'completo',
  },
  branding: {
    titulo: 'Link sem a marca faz parte do Completo',
    frase: 'No Grátis o relatório vai com o selo "Feito com ObraPro". No plano pago, o relatório é seu — só a sua obra.',
    icon: 'fa-tag',
    destaque: 'completo',
  },
  linkCompleto: {
    titulo: 'O relatório completo faz parte do Completo',
    frase: 'Mande o extrato de despesas e o resultado do empreendimento junto no link. No Grátis vai só a foto, o gasto × avanço, o orçamento e o caixa.',
    icon: 'fa-share-nodes',
    destaque: 'completo',
  },
  obras: {
    titulo: 'Mais de uma obra faz parte do Completo',
    frase: 'Toque várias obras ao mesmo tempo, cada uma com seu caixa, e veja todas juntas no painel. Obra arquivada não ocupa vaga.',
    icon: 'fa-helmet-safety',
    destaque: 'completo',
  },
  socios: {
    titulo: 'Sócios individuais fazem parte do Completo',
    frase: 'Cadastre cada sócio, veja quanto cada um já aportou, o extrato individual e faça chamadas de aporte. No Grátis tudo cai em "Recursos próprios".',
    icon: 'fa-users',
    destaque: 'completo',
  },
  multiusuario: {
    titulo: 'Sua equipe na obra faz parte do Construtora',
    frase: 'Bote o mestre, o gestor e o escritório na mesma obra — cada pessoa acessa apenas o que precisa.',
    icon: 'fa-user-plus',
    destaque: 'construtora',
  },
};

// Cabeçalho quando a pessoa abre a vitrine PELO MENU ('geral'): o texto muda
// conforme o próximo passo dela — não é sempre o discurso de quem está no Grátis.
const GERAL_POR_DESTINO: Record<Destaque, { titulo: string; frase: string; icon: string }> = {
  completo: {
    titulo: 'Conheça o Completo',
    frase: 'O Grátis segura uma obra. Suba pro Completo pra detalhar o dinheiro item a item, escanear nota, tirar a marca do relatório e prestar contas pro sócio.',
    icon: 'fa-helmet-safety',
  },
  construtora: {
    titulo: 'Pronto pra virar empresa?',
    frase: 'Você já tem o controle do dinheiro no Completo. O Construtora abre a obra pra sua equipe — mestre, gestor e escritório, cada um vendo só o que precisa — com obras ilimitadas e o copiloto de IA.',
    icon: 'fa-user-plus',
  },
};

interface Plano {
  id: Destaque | 'basico';
  nome: string;
  fundador: string | null; // preço de fundador /mês (null = grátis)
  cheio: string;           // preço cheio /mês, ou "Grátis"
  obras: string;
  itens: string[];
  cta: string | null;      // texto do botão (null = plano grátis, sem CTA)
}

// Degrau de cada plano (0 = mais baixo). Serve pra saber quem é o plano ATUAL,
// quem está ACIMA (pode assinar) e quem é o PRÓXIMO passo (recomendado).
const RANK: Record<Plano['id'], number> = { basico: 0, completo: 1, construtora: 2 };
// Etiqueta do banco → card da vitrine.
const PLAN_TO_CARD: Record<PlanId, Plano['id']> = { free: 'basico', pro: 'completo', business: 'construtora' };

const PLANOS: Plano[] = [
  {
    id: 'basico', nome: 'Grátis', fundador: null, cheio: 'Grátis', obras: '1 obra',
    itens: [
      'Caixa: entradas e saídas',
      'Avanço da obra por etapa',
      'Orçamento previsto × gasto',
      'Anotar o item de cada gasto',
      'Link e foto pra mostrar a obra',
    ],
    cta: null,
  },
  {
    id: 'completo', nome: 'Completo', fundador: 'R$ 99', cheio: 'R$ 149', obras: 'Até 4 obras',
    itens: [
      'Tudo do Grátis',
      'Análise por item: previsto × real',
      'Escanear comprovante com a câmera',
      'Relatório em PDF e link sem a marca',
      'Sócios: aportes, extrato e chamadas',
    ],
    cta: 'Quero o plano Completo',
  },
  {
    id: 'construtora', nome: 'Construtora', fundador: 'R$ 199', cheio: 'R$ 299', obras: 'Obras ilimitadas',
    itens: [
      'Tudo do Completo',
      'Sua equipe na obra (mestre, gestor, sócio-gestor)',
      'Cada pessoa acessa apenas o que precisa',
      'Obras ilimitadas',
      'Copiloto de IA',
    ],
    cta: 'Quero o plano Construtora',
  },
];

interface Props {
  feature: UpgradeFeature;
  onClose: () => void;
  /** Plano que a pessoa já tem hoje. Sem isso, a vitrine assume Grátis. */
  currentPlan?: PlanId;
}

const UpgradeModal: React.FC<Props> = ({ feature, onClose, currentPlan }) => {
  const copy = COPY[feature];

  // Onde a pessoa está e qual é o próximo degrau. A vitrine NUNCA oferece o
  // plano que a pessoa já tem: o recomendado é o degrau do gatilho, mas se ele
  // for igual ou abaixo do plano atual, sobe pro próximo passo pra cima.
  const currentCard = currentPlan ? PLAN_TO_CARD[currentPlan] : 'basico';
  const currentRank = RANK[currentCard];
  let recRank = RANK[copy.destaque];
  if (recRank <= currentRank) recRank = currentRank + 1;
  const recomendadoId = PLANOS.find(p => RANK[p.id] === recRank)?.id ?? null;

  // Cabeçalho: se a pessoa tocou num recurso trancado, fala DAQUELE recurso. Se
  // veio pelo menu ('geral'), o texto acompanha o próximo passo dela; e quem já
  // está no topo (Construtora) vê que não há pra onde subir.
  const header =
    feature !== 'geral'
      ? { titulo: copy.titulo, frase: copy.frase, icon: copy.icon }
      : recomendadoId === 'completo' || recomendadoId === 'construtora'
      ? GERAL_POR_DESTINO[recomendadoId]
      : {
          titulo: 'Você já está no topo',
          frase: 'O Construtora é o plano mais completo do ObraPro — você já tem tudo liberado.',
          icon: 'fa-crown',
        };

  const pedir = (p: Plano) => {
    const msg = encodeURIComponent(
      `Olá! Quero o plano ${p.nome} do ObraPro (${p.fundador}/mês, preço de fundador). Vim pelo app.`
    );
    window.open(`https://wa.me/${UPGRADE_WHATSAPP}?text=${msg}`, '_blank', 'noopener');
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho: a coisa que a pessoa tentou fazer */}
        <div className="p-6 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <i className={`fa-solid ${header.icon} text-xl`}></i>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
              title="Fechar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <h2 className="text-lg font-black text-white mt-4">{header.titulo}</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">{header.frase}</p>
        </div>

        {/* Os 3 planos, lado a lado (empilhados no celular) */}
        <div className="p-4 space-y-3">
          {[...PLANOS]
            .sort((a, b) => {
              // Recomendado sempre no topo; o resto por valor decrescente
              // (planos maiores mais acima, Grátis por último).
              if (a.id === recomendadoId) return -1;
              if (b.id === recomendadoId) return 1;
              return RANK[b.id] - RANK[a.id];
            })
            .map(p => {
            const isAtual = p.id === currentCard;
            const destaque = p.id === recomendadoId;
            const podeAssinar = RANK[p.id] > currentRank; // só planos ACIMA do atual
            const borda = isAtual
              ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
              : destaque
              ? 'border-amber-500/60 bg-amber-500/[0.06]'
              : 'border-slate-700 bg-slate-800/40';
            return (
              <div key={p.id} className={`rounded-2xl border p-5 ${borda}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-white font-black text-base">{p.nome}</h3>
                  {isAtual ? (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full">
                      Seu plano atual
                    </span>
                  ) : destaque ? (
                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full">
                      Recomendado
                    </span>
                  ) : null}
                </div>

                <div className="flex items-baseline gap-2 mt-1">
                  {p.fundador ? (
                    <>
                      <span className="text-2xl font-black text-white">{p.fundador}</span>
                      <span className="text-slate-400 text-xs font-bold">/mês</span>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                        Fundador
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-black text-white">{p.cheio}</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {p.fundador ? `Depois ${p.cheio}/mês · ${p.obras}` : p.obras}
                </p>

                <div className="mt-3 space-y-1.5">
                  {p.itens.map(it => (
                    <div key={it} className="flex items-start gap-2">
                      <i className="fa-solid fa-check text-emerald-400 text-[11px] mt-1 shrink-0"></i>
                      <span className="text-slate-300 text-[13px]">{it}</span>
                    </div>
                  ))}
                </div>

                {isAtual ? (
                  <div className="w-full mt-4 px-4 py-3 rounded-2xl font-black text-sm bg-emerald-500/10 text-emerald-400 flex items-center justify-center gap-2">
                    <i className="fa-solid fa-check text-base"></i>
                    Seu plano atual
                  </div>
                ) : (
                  p.cta && podeAssinar && (
                    <button
                      onClick={() => pedir(p)}
                      className={`w-full mt-4 px-4 py-3 rounded-2xl font-black text-sm transition-colors flex items-center justify-center gap-2 ${
                        destaque ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'
                      }`}
                    >
                      <i className="fa-brands fa-whatsapp text-base"></i>
                      {p.cta}
                    </button>
                  )
                )}
              </div>
            );
          })}

          <p className="text-center text-[11px] text-slate-500 px-4 pt-1">
            Preço de fundador travado por 12 meses. A liberação é rápida, pelo WhatsApp.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-slate-400 hover:text-white rounded-2xl font-bold text-sm transition-colors"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body
  );
};

export default UpgradeModal;
