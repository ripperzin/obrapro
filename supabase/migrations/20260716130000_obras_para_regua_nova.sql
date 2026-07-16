-- Passa as obras que ainda estao na regua VELHA (7 etapas) para a regua NOVA (9 etapas).
--
-- Contexto: o preset de 9 etapas so valia para obra NOVA. As obras que ja existiam
-- ficaram nos 7 nomes antigos, entao o app estava metade num modelo e metade no outro:
-- o "Previsto por item" so semeava na Estrutura (unico nome que casava entre as duas
-- reguas) e o gasto por etapa era lido contra uma regua que a reescrita aposentou.
--
-- DE-PARA (decidido pelo Victor: o que nao for claramente uma etapa nova fica EM BRANCO,
-- ele reclassifica no app):
--   Projetos e Engenharia + Taxas e Papelada -> 1. Projetos e servicos preliminares
--   Fundacao e Alicerce                      -> 2. Terraplenagem e fundacoes
--   Estrutura e Alvenaria                    -> 3. Estrutura e alvenaria
--   Eletrica e Hidraulica                    -> 5. Instalacoes eletricas e hidraulicas
--   Acabamentos (Piso/Reboco/Pintura)        -> EM BRANCO (parte em duas etapas novas)
--   Geral/Outros                             -> EM BRANCO (tem terreno e aporte dentro)
--
-- O QUE NAO MUDA: nenhuma despesa e apagada. Anexo, descricao, valor, data e quem pagou
-- ficam intactos - so os campos Etapa e Detalhe sao mexidos. Provado em ensaio contra
-- os dados reais de producao (142 despesas / 132 anexos antes e depois, identicos).
--
-- SE PERDE: as datas de cronograma das etapas velhas (a regua mudou, nao ha de-para
-- possivel). Regerar no botao "Gerar cronograma" do Orcamento.
--
-- DEPENDE de 20260716120000_aposentar_submacros: sem ela, o gatilho de criacao de
-- orcamento semeia 52 submacros em cada obra que passar por aqui.

begin;

do $$
declare
  r record;
  v_budget_id uuid;
begin
  -- Quem ainda esta na regua velha. Coletado ANTES do loop: o loop apaga e recria
  -- os proprios orcamentos que o cursor esta lendo.
  create temp table _alvo on commit drop as
  select distinct b.project_id, b.id as budget_id, b.total_estimated, b.template_id
    from project_budgets b
    join project_macros m on m.budget_id = b.id
   where m.name in ('Projetos e Engenharia','Taxas e Papelada','Estrutura e Alvenaria','Geral/Outros')
      or m.name like 'Funda%'
      or m.name like 'El%trica%'
      or m.name like 'Acabamentos%';

  create temp table _dp (expense_id uuid, novo_ord int) on commit drop;

  for r in select * from _alvo loop

    -- 1) Guardar para onde cada despesa vai, ANTES de soltar.
    delete from _dp;
    insert into _dp (expense_id, novo_ord)
    select e.id,
           case when m.name in ('Projetos e Engenharia','Taxas e Papelada') then 1
                when m.name like 'Funda%'             then 2
                when m.name = 'Estrutura e Alvenaria'  then 3
                when m.name like 'El%trica%'           then 5
                else null
           end
      from expenses e
      join project_macros m on m.id = e.macro_id
     where e.project_id = r.project_id;

    -- 2) Soltar as despesas. Obrigatorio: expenses.macro_id e NO ACTION, o banco
    --    recusaria apagar uma etapa com despesa pendurada (a rede de seguranca).
    update expenses
       set macro_id = null, sub_macro_id = null
     where project_id = r.project_id;

    -- 3) Apagar o orcamento. Cascata leva as 7 etapas velhas e os stage_items delas.
    delete from project_budgets where id = r.budget_id;

    -- 4) Recriar com o MESMO total e template -> o gatilho semeia as 9 etapas novas,
    --    ja com time_based no Canteiro.
    insert into project_budgets (project_id, total_estimated, template_id)
    values (r.project_id, r.total_estimated, r.template_id)
    returning id into v_budget_id;

    -- 5) Religar as despesas que tem de-para obvio. As outras ficam sem etapa.
    update expenses e
       set macro_id = m.id
      from _dp d, project_macros m
     where e.id = d.expense_id
       and d.novo_ord is not null
       and m.budget_id = v_budget_id
       and m.display_order = d.novo_ord;

    -- 6) Semear o Previsto por item. Corpo copiado de seed_project_stage_items,
    --    sem a checagem can_access_project (migration roda como dono do banco,
    --    nao ha usuario logado). Agora os 9 nomes casam com o template, entao
    --    semeia a regua inteira - antes so a Estrutura casava.
    insert into project_stage_items (project_id, macro_id, item_id, percentage, display_order)
    select r.project_id, pm.id, pi.id, tsi.percentage, tsi.display_order
      from project_macros pm
      join template_stage_items tsi
        on tsi.template_id = '00000000-0000-0000-0000-000000000001'
       and lower(tsi.macro_name) = lower(pm.name)
      join project_items pi
        on pi.project_id = r.project_id
       and lower(pi.name) = lower(tsi.item_name)
     where pm.budget_id = v_budget_id;

  end loop;
end $$;

commit;
