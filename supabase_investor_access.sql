-- Desbloquear acesso público para o Portal do Investidor
-- (Permite leitura anonima para quem tiver o ID do projeto)

-- 1. Projetos
create policy "Allow public view projects"
on projects for select
to anon
using (true);

-- 2. Unidades
create policy "Allow public view units"
on units for select
to anon
using (true);

-- 3. Evidências de Etapas
create policy "Allow public view stage_evidences"
on stage_evidences for select
to anon
using (true);

-- 4. Despesas (necessário para o cálculo de saúde financeira e extrato)
create policy "Allow public view expenses"
on expenses for select
to anon
using (true);

-- 5. Orçamentos e Macros
create policy "Allow public view project_budgets"
on project_budgets for select
to anon
using (true);

create policy "Allow public view project_macros"
on project_macros for select
to anon
using (true);

create policy "Allow public view project_sub_macros"
on project_sub_macros for select
to anon
using (true);
