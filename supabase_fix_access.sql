-- ==============================================================================
-- FIX: FORÇAR ACESSO A DADOS (EMERGÊNCIA)
-- DATA: 25/01/2025
-- ==============================================================================

-- 1. Descobrir quem é você (para debug, pode rodar separado se quiser)
-- select auth.uid();

-- 2. "Apropriação Indébita" do Bem:
-- Pega TODOS os projetos que existem e coloca VOCÊ (o usuário rodando o script) como dono.
-- Isso garante que você volte a ver as obras.

insert into public.project_members (project_id, user_id, role)
select 
    p.id as project_id,
    auth.uid() as user_id,
    'owner' as role
from projects p
on conflict (project_id, user_id) 
do update set role = 'owner'; -- Se já existir, garante que é owner

-- 3. Confirmação
-- Se rodar com sucesso, deve inserir X linhas (onde X é o número de obras que você tinha).
