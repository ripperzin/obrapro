-- Custo de referência por m² da obra (usado para recalcular o custo das casas em lote).
-- Guardado na obra para que exista um único lugar de referência, editável, que cascateia
-- para o custo estimado de cada unidade (cost = área × custo_m2).
alter table public.projects
    add column if not exists custo_m2 numeric not null default 0;

comment on column public.projects.custo_m2 is
    'Custo de referência por m² da obra. Base para recalcular o custo estimado das unidades em lote.';

-- Backfill: obras já existentes recebem o R$/m² derivado dos custos já lançados nas casas
-- (custo total das unidades ÷ área total das unidades). Só preenche onde ainda está zerado.
update public.projects p
set custo_m2 = round(sub.avg_m2::numeric, 2)
from (
    select project_id, sum(cost) / nullif(sum(area), 0) as avg_m2
    from public.units
    group by project_id
) sub
where sub.project_id = p.id
  and coalesce(p.custo_m2, 0) = 0
  and sub.avg_m2 is not null;
