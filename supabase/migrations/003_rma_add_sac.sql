-- Adiciona coluna SAC na tabela RMA
ALTER TABLE rma ADD COLUMN IF NOT EXISTS sac text;
CREATE INDEX IF NOT EXISTS idx_rma_sac ON rma(sac);
