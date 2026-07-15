-- Modo de divisão do empreendimento, por obra:
--   'percent' = rateio de lucro/aporte por porcentagem (padrão, comportamento atual)
--   'unit'    = divisão física: cada sócio tem casa(s); lucro/aporte pela casa dele
alter table public.projects
  add column if not exists split_mode text not null default 'percent';

-- Sócio que participa do LUCRO mas NÃO APORTA (ex.: administrador da obra).
-- No modo 'percent', a cota de aporte é renormalizada entre os que aportam.
alter table public.profit_shares
  add column if not exists nao_aporta boolean not null default false;
