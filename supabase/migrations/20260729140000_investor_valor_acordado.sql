-- Meta de aporte "à mão": valor de capital que o sócio COMBINOU pôr na obra.
--
-- valor_acordado em investors: quando preenchido (> 0), é a meta de aporte daquele sócio
-- (o "Total acordado" da planilha da sociedade) — manda POR CIMA do cálculo automático.
-- Vazio/null = automático (a meta segue vindo do custo: casas do sócio ou % do empreendimento).
-- Não muda nada de quem já usa o automático.
alter table public.investors
    add column if not exists valor_acordado numeric;

comment on column public.investors.valor_acordado is
    'Meta de aporte combinada à mão (capital que o sócio se comprometeu a pôr). Preenchido = manda por cima do cálculo automático; null = automático.';
