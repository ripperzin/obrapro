-- PERMUTA física: pegar o terreno dando N casas ao dono da terra (em vez de pagar dinheiro).
--
-- paid_with_units em acquisition_costs: quando true, esse custo de terreno foi "pago com casas"
-- (permuta) — NÃO é custo em dinheiro do empreendimento e NÃO entra no rateio/lucro/meta dos sócios.
-- Fica só como informação. As casas dadas em troca recebem status 'Permuta' (units.status), cujo
-- custo de CONSTRUÇÃO continua no gasto (o material das casas é o que a terra custou), mas que NÃO
-- geram receita nem têm dono. Regra de ouro: o terreno é pago OU pelos sócios (rateado nas casas
-- deles) OU pelas casas da permuta — NUNCA os dois.
alter table public.acquisition_costs
    add column if not exists paid_with_units boolean not null default false;

comment on column public.acquisition_costs.paid_with_units is
    'Permuta: quando true, este custo de terreno foi pago com casas (status Permuta) — não é custo em dinheiro, fica só como informação e sai do custo/rateio/lucro do empreendimento.';
