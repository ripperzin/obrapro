-- Workstream Sociedade: despesa paga por sócio + pagador padrão da obra.
--
-- paid_by_investor_id na despesa: quando preenchido, a despesa foi paga direto por
-- esse investidor/sócio (do bolso) — conta no custo, NÃO sai do caixa, e é derivada
-- como aporte dele. Vazio (null) = paga pelo caixa da obra (comportamento padrão).
alter table public.expenses
    add column if not exists paid_by_investor_id uuid references public.investors(id) on delete set null;

-- financed_by_investor_id na obra: pagador padrão. Toda despesa nova já nasce marcada
-- como paga por esse sócio (resolve obra de 1 sócio sem marcar despesa a despesa).
alter table public.projects
    add column if not exists financed_by_investor_id uuid references public.investors(id) on delete set null;

comment on column public.expenses.paid_by_investor_id is
    'Se preenchido, a despesa foi paga diretamente por esse investidor/sócio (não saiu do caixa; vira aporte dele).';
comment on column public.projects.financed_by_investor_id is
    'Pagador padrão da obra: novas despesas já nascem marcadas como pagas por esse investidor/sócio.';
