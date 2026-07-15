-- ==============================================================================
-- MIGRATION: COPILOTO IA = SÓ NO BUSINESS (ajuste de cota por plano)
-- DATA: 2026-07-15
-- ==============================================================================
-- A migration 20260611120000 dava 300 chamadas/mês de copiloto ao plano 'pro'.
-- A revisão de planos de 2026-07-15 tirou o copiloto do lançamento: o plano
-- ObraPro ('pro') vende o LOOP (importar → painel → aportes/gastos/saldo →
-- evolução → compartilhar), e a IA/copiloto fica para um futuro Business.
--
-- Aqui só zeramos a cota de copiloto do 'pro'. O OCR de comprovante CONTINUA
-- no 'pro' (100/mês) — ele faz parte do plano pago.
-- ==============================================================================

begin;

create or replace function public.ai_monthly_limit(p_plan text, p_kind text)
returns int language sql immutable as $$
  select case p_kind
    when 'ocr' then case p_plan
      when 'free' then 0 when 'pro' then 100 when 'business' then 100000 else 0 end
    when 'copilot' then case p_plan
      -- 'pro' zerado: copiloto é recurso de Business/futuro.
      when 'free' then 0 when 'pro' then 0 when 'business' then 100000 else 0 end
    else 0
  end;
$$;

commit;
