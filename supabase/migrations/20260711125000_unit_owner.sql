-- Vínculo opcional unidade → sócio (investor).
-- Divisão física do empreendimento: cada sócio pode "ter" uma ou mais unidades
-- (arranjo comum em MCMV — permuta/divisão por casa em vez de rateio em dinheiro).
-- Nulo = unidade sem dono definido. ON DELETE SET NULL: apagar o sócio não apaga a casa.
alter table public.units
  add column if not exists owner_investor_id uuid references public.investors(id) on delete set null;

create index if not exists idx_units_owner_investor_id on public.units(owner_investor_id);
