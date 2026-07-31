// Número ÚNICO de contato/suporte do ObraPro (DDI+DDD, só dígitos). Usado na
// vitrine de upgrade e na tela de conta suspensa. Trocou aqui, trocou em todo lugar.
export const SUPPORT_WHATSAPP = '5567982042203';

// Link pronto pro WhatsApp (com texto opcional já URL-encoded pelo chamador).
export const whatsappLink = (text?: string): string =>
  `https://wa.me/${SUPPORT_WHATSAPP}${text ? `?text=${text}` : ''}`;
