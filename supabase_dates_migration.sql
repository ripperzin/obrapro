-- Migration: Adicionar campos de data ao projeto
-- Esses campos são a base para cálculos de prazo e Curva S

ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_date date;

-- Comentários descritivos
COMMENT ON COLUMN projects.start_date IS 'Data de início da obra';
COMMENT ON COLUMN projects.delivery_date IS 'Data prevista de entrega da obra';

-- Forçar refresh do schema cache
NOTIFY pgrst, 'reload config';
