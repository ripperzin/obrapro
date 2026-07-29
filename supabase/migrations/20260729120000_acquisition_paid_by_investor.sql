-- Custo de aquisição (terreno, corretagem, cartório, imposto) pago direto por um sócio.
--
-- paid_by_investor_id no custo de aquisição: quando preenchido, o custo foi pago direto
-- por esse investidor/sócio (do bolso) — conta no custo total, NÃO sai do caixa, e é
-- derivado como aporte dele. Espelha public.expenses.paid_by_investor_id.
-- Vazio (null) = pago pelo caixa da obra (paid_from_project=true) ou "já era meu"
-- (paid_from_project=false sem sócio).
alter table public.acquisition_costs
    add column if not exists paid_by_investor_id uuid references public.investors(id) on delete set null;

comment on column public.acquisition_costs.paid_by_investor_id is
    'Se preenchido, o custo de aquisição foi pago diretamente por esse investidor/sócio (não saiu do caixa; vira aporte dele).';
