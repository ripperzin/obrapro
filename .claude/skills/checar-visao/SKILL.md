---
name: checar-visao
description: "Checklist rápido pra NÃO TRAVAR a visão de longo prazo do ObraPro (Radar/Rede/Verificado/Capital/Vendas). Aciona ANTES de: criar/alterar campo ou tabela, mexer no modelo de dados, deletar dado, desenhar feature nova, ou mudar como despesa/obra/item/etapa são gravados. Bate a decisão contra a lista do 'deixar pronto agora' (cidade, enums de obra, item global, datas por etapa, fornecedor, consentimento granular, soft delete). NÃO manda construir a visão — só evita fechar a porta de graça. Detalhe completo na memória visao-plataforma-ecossistema."
---

# Checar a visão (não travar o futuro)

Use quando uma mudança **toca no modelo de dados ou em como algo é gravado** (campo/tabela nova,
alteração de schema, delete de dado, feature que grava obra/despesa/item/etapa/sócio). O objetivo NÃO
é construir a visão grande agora — é gastar 30 segundos garantindo que a decisão de hoje não fecha uma
porta que é **cara de reabrir depois** em cima de obra real rodando.

Contexto completo: memória `visao-plataforma-ecossistema`. Norte do produto continua sendo o coração
financeiro (`obrapro-prod` / `mvp-posicionamento-controle-financeiro`) — a visão é background, não
prioridade.

## Regra de ouro
> Deixar a porta aberta ≠ construir o cômodo. Só cai neste checklist o que é **CARO de retrofitar
> depois**. Se é barato adicionar no futuro (reputação, score, matchmaking, crédito, qualquer tabela
> "pra quando a rede existir"), **NÃO fazer agora** — a modelagem certa só aparece quando a rede
> existir. E nada disto pode atrasar o que está sendo validado com os 5 usuários.

## Checklist (rodar mentalmente antes de gravar a decisão)
Se a mudança envolve **obra**:
- [ ] Tem **cidade/UF**? (e, se dá, coordenada aproximada) — sem isso nada regional funciona depois.
- [ ] **Metragem, nº de unidades, padrão, tipologia, técnica** são **enum curto**, não texto livre?

Se envolve **item de gasto**:
- [ ] O item é **global com id estável**, não string solta por obra? (fuzzy match na criação)
- [ ] Anotar item continua **grátis pra todos** (`canLogItens`)? — o histórico não pode nascer cego.

Se envolve **despesa**:
- [ ] Tem lugar pro **fornecedor** (mesmo que só texto opcional normalizado, sem tela)?
- [ ] O delete é **soft delete**? Base histórica NÃO pode ter buraco. Nunca apagar despesa de verdade.

Se envolve **etapa/cronograma**:
- [ ] Guarda **datas reais de início/fim por etapa**, não só o %? Prazo por etapa é irreconstruível.

Se envolve **compartilhar / expor / usar dado do usuário**:
- [ ] Existe **consentimento granular** (permissão separada + timestamp + versão do termo)? Nunca um
      botão único "aceito compartilhar". Retroagir consentimento LGPD é impossível.
- [ ] O dado exposto/anonimizado corre risco de **reidentificação** (custo+local+metragem+data juntos)?
      Exigir amostra mínima / ampliar raio.

## O que responder
Se algum item bater, **avise o Victor em 1 linha** ("pra não travar o Radar depois, esse campo de obra
devia ter cidade — custa X agora"). Ele decide. Se nada bater, seguir normal. Não transformar isto em
travão: é um lembrete barato, ponto a ponto, do jeito que a gente trabalha.
