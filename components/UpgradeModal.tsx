import React from 'react';

// WhatsApp que recebe os pedidos de upgrade (DDI+DDD, só números).
// Enquanto o checkout do Mercado Pago não existe (Fase 2 do lançamento), o
// convite abre uma conversa com o Victor e a liberação é na mão (profiles.plan).
export const UPGRADE_WHATSAPP = '5567982042203';

/**
 * O que disparou o convite. Quase sempre é um recurso que ele tentou usar;
 * 'geral' é quando ele veio pelo menu, por vontade própria (aí não há uma
 * frase específica a dar — o convite fala do pacote).
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

interface Copy {
  titulo: string;
  frase: string;
  icon: string;
}

// O convite é sempre o mesmo desenho; muda só a frase de cima, que fala da
// coisa que ele acabou de tentar fazer.
const COPY: Record<UpgradeFeature, Copy> = {
  geral: {
    titulo: 'Conheça o ObraPro',
    frase: 'O Free segura uma obra. O ObraPro segura a sua operação: mais obras, o dinheiro detalhado item a item e a prestação de contas pronta para o sócio.',
    icon: 'fa-helmet-safety',
  },
  itens: {
    titulo: 'Itens de gasto fazem parte do ObraPro',
    frase: 'Veja para onde o dinheiro foi de verdade — cimento, areia, frete — e compare o previsto com o real de cada item, dentro de cada etapa.',
    icon: 'fa-boxes-stacked',
  },
  ocr: {
    titulo: 'Escanear comprovante faz parte do ObraPro',
    frase: 'Fotografe a nota e o gasto se lança sozinho: valor, data e descrição preenchidos. Menos digitação no fim do dia.',
    icon: 'fa-camera',
  },
  pdf: {
    titulo: 'O relatório em PDF faz parte do ObraPro',
    frase: 'O mesmo relatório do link, em PDF, pronto para mandar no grupo, imprimir ou anexar na prestação de contas.',
    icon: 'fa-file-pdf',
  },
  branding: {
    titulo: 'Link sem a marca ObraPro faz parte do plano ObraPro',
    frase: 'No Free o relatório vai com o selo "Feito com ObraPro". No plano pago, o relatório é seu — só a sua obra.',
    icon: 'fa-tag',
  },
  linkCompleto: {
    titulo: 'O relatório completo faz parte do ObraPro',
    frase: 'Mande o extrato de despesas e o resultado do empreendimento junto no link. No Free vai só a foto, o gasto × avanço, o orçamento e o caixa.',
    icon: 'fa-share-nodes',
  },
  obras: {
    titulo: 'Mais de uma obra faz parte do ObraPro',
    frase: 'Toque até 10 obras ao mesmo tempo, cada uma com seu caixa, e veja todas juntas no painel. Obra arquivada não ocupa vaga.',
    icon: 'fa-helmet-safety',
  },
  socios: {
    titulo: 'Sócios individuais fazem parte do ObraPro',
    frase: 'Cadastre cada sócio, veja quanto cada um já aportou, o extrato individual e faça chamadas de aporte. No Free tudo cai em "Recursos próprios".',
    icon: 'fa-users',
  },
  multiusuario: {
    titulo: 'Mais de um usuário faz parte do ObraPro',
    frase: 'Coloque o mestre e o escritório lançando na mesma obra, cada um com seu acesso.',
    icon: 'fa-user-plus',
  },
};

// O que vem junto — igual em todos os convites, pra ele ver o pacote e não só
// a peça que faltou.
const INCLUSO = [
  'Até 10 obras ativas',
  'Itens de gasto (para onde o dinheiro foi)',
  'Escanear comprovante com a câmera',
  'Relatório em PDF e link sem a marca ObraPro',
  'Sócios individuais, extrato e chamadas de aporte',
  'Mais de um usuário na obra',
];

interface Props {
  feature: UpgradeFeature;
  onClose: () => void;
}

const UpgradeModal: React.FC<Props> = ({ feature, onClose }) => {
  const copy = COPY[feature];

  const handleQuero = () => {
    const msg = encodeURIComponent(
      `Olá! Quero o ObraPro (plano fundador R$99/mês). Vim pelo app — recurso: ${copy.titulo}`
    );
    window.open(`https://wa.me/${UPGRADE_WHATSAPP}?text=${msg}`, '_blank', 'noopener');
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho: a coisa que ele tentou fazer */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <i className={`fa-solid ${copy.icon} text-xl`}></i>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
              title="Fechar"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <h2 className="text-lg font-black text-white mt-4">{copy.titulo}</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">{copy.frase}</p>
        </div>

        {/* O pacote */}
        <div className="p-6 space-y-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
            O que vem no ObraPro
          </p>
          {INCLUSO.map(item => (
            <div key={item} className="flex items-start gap-2.5">
              <i className="fa-solid fa-check text-emerald-400 text-xs mt-1 shrink-0"></i>
              <span className="text-slate-300 text-sm">{item}</span>
            </div>
          ))}
        </div>

        {/* Preço + ação */}
        <div className="p-6 border-t border-slate-800 space-y-3">
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">R$ 99</span>
              <span className="text-slate-400 text-sm font-bold">/mês</span>
              <span className="ml-auto text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 px-2 py-1 rounded-full">
                Fundador
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-2">
              Preço de fundador travado por 12 meses. Depois, R$ 179/mês (ou R$ 1.790/ano).
            </p>
          </div>
          <button
            onClick={handleQuero}
            className="w-full px-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black transition-colors flex items-center justify-center gap-2"
          >
            <i className="fa-brands fa-whatsapp text-lg"></i>
            Quero o ObraPro
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-slate-400 hover:text-white rounded-2xl font-bold text-sm transition-colors"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
