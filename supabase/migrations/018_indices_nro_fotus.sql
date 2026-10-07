-- Migration 018: índices nas colunas que ligam RMA à venda (Nro. Fotus).
--
-- A função rma_taxa_por_coorte_venda liga rma.nro_fotus a vendas.numero_fotus. Sem índice,
-- o Postgres varria a tabela vendas inteira (~257 mil linhas) uma vez por RMA vinculado:
-- ~8 s só nessa parte para um modelo com 35 RMAs, estourando o limite de 8 s da API
-- (linhas de potência/modelo da árvore ficavam com "—").
--
-- COMO RODAR (SQL Editor do Supabase): rode um CREATE INDEX por vez. São rápidos (segundos).
-- Para desfazer: DROP INDEX idx_vendas_numero_fotus; DROP INDEX idx_rma_nro_fotus;

CREATE INDEX IF NOT EXISTS idx_vendas_numero_fotus ON public.vendas (numero_fotus);

CREATE INDEX IF NOT EXISTS idx_rma_nro_fotus ON public.rma (nro_fotus);

ANALYZE public.vendas;
ANALYZE public.rma;
