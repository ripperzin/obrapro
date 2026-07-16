-- Arquivar obra: tira da lista ativa sem apagar os dados (histórico preservado).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
