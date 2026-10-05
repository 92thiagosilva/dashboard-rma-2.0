-- Migration 009: reverte a função de coorte para a versão RÁPIDA (apenas contagens).
--
-- Motivo: a migration 008 adicionou o cálculo em kW (JOIN de vendas com o mapa de
-- potência + GROUP BY por SAC) que deixou o RPC lento demais, estourando o timeout
-- do Supabase (Gateway Timeout). Isso quebrou o card de Coorte e a tabela por
-- Fabricante em produção.
--
-- Esta migration restaura o comportamento comprovadamente rápido (sem kW) e adiciona
-- índices que aceleram as consultas de coorte. O card de Coorte e a tabela por
-- Fabricante voltam a exibir em inversores (fallback já tratado no app).
--
-- Como rodar: Supabase > SQL Editor > cole tudo > Run. Idempotente.
-- (Os CREATE INDEX podem levar alguns segundos sobre tabelas grandes.)

-- ===== Índices de apoio (aceleram a coorte) =====
CREATE INDEX IF NOT EXISTS idx_rma_nro_fotus       ON rma (nro_fotus);
CREATE INDEX IF NOT EXISTS idx_rma_data_criacao    ON rma (data_criacao);
CREATE INDEX IF NOT EXISTS idx_rma_fabricante      ON rma (fabricante);
CREATE INDEX IF NOT EXISTS idx_vendas_numero_fotus ON vendas (numero_fotus);
CREATE INDEX IF NOT EXISTS idx_vendas_data_venda   ON vendas (data_venda);
CREATE INDEX IF NOT EXISTS idx_rma_produto_norm    ON rma (UPPER(TRIM(produto)));
CREATE INDEX IF NOT EXISTS idx_vendas_desc_norm    ON vendas (UPPER(TRIM(descricao_produto)));

-- ===== Função de coorte (apenas contagens — versão rápida, igual à 007) =====
CREATE OR REPLACE FUNCTION rma_taxa_por_coorte_venda(
  p_date_start    date    DEFAULT NULL,
  p_date_end      date    DEFAULT NULL,
  p_fabricantes   text[]  DEFAULT NULL,
  p_modelos       text[]  DEFAULT NULL,
  p_apenas_ativos boolean DEFAULT false
)
RETURNS json AS $$
DECLARE
  v_linked_rma bigint  := 0;
  v_total_inv  bigint  := 0;
  v_has_filter boolean;
  v_ativos     text[];
BEGIN
  v_has_filter := (
    (p_fabricantes IS NOT NULL AND array_length(p_fabricantes, 1) > 0)
    OR (p_modelos IS NOT NULL AND array_length(p_modelos, 1) > 0)
  );

  IF p_apenas_ativos THEN
    SELECT array_agg(t.p) INTO v_ativos
    FROM (
      SELECT UPPER(TRIM(descricao_produto)) AS p
      FROM vendas
      WHERE descricao_produto IS NOT NULL
        AND data_venda >= (COALESCE(p_date_end, CURRENT_DATE) - INTERVAL '6 months')
        AND data_venda <= COALESCE(p_date_end, CURRENT_DATE)
      GROUP BY UPPER(TRIM(descricao_produto))
      HAVING SUM(quantidade_vendida) > 10
    ) t;
    IF v_ativos IS NULL THEN v_ativos := ARRAY[]::text[]; END IF;
  END IF;

  SELECT COALESCE(SUM(v.quantidade_vendida), 0)
  INTO v_total_inv
  FROM vendas v
  WHERE (p_date_start IS NULL OR v.data_venda >= p_date_start)
    AND (p_date_end   IS NULL OR v.data_venda <= p_date_end)
    AND (NOT p_apenas_ativos OR UPPER(TRIM(v.descricao_produto)) = ANY(v_ativos))
    AND (
      NOT v_has_filter
      OR UPPER(TRIM(v.descricao_produto)) IN (
        SELECT DISTINCT UPPER(TRIM(r.produto))
        FROM rma r
        WHERE r.produto IS NOT NULL
          AND (p_fabricantes IS NULL OR array_length(p_fabricantes, 1) = 0 OR r.fabricante = ANY(p_fabricantes))
          AND (p_modelos     IS NULL OR array_length(p_modelos,     1) = 0 OR r.produto    = ANY(p_modelos))
      )
    );

  SELECT COUNT(DISTINCT COALESCE(r.sac, r.id::text))
  INTO v_linked_rma
  FROM rma r
  WHERE r.nro_fotus IS NOT NULL
    AND (NOT p_apenas_ativos OR UPPER(TRIM(r.produto)) = ANY(v_ativos))
    AND (p_fabricantes IS NULL OR array_length(p_fabricantes, 1) = 0 OR r.fabricante = ANY(p_fabricantes))
    AND (p_modelos     IS NULL OR array_length(p_modelos,     1) = 0 OR r.produto    = ANY(p_modelos))
    AND r.nro_fotus IN (
      SELECT v.numero_fotus
      FROM vendas v
      WHERE v.numero_fotus IS NOT NULL
        AND (p_date_start IS NULL OR v.data_venda >= p_date_start)
        AND (p_date_end   IS NULL OR v.data_venda <= p_date_end)
        AND (NOT p_apenas_ativos OR UPPER(TRIM(v.descricao_produto)) = ANY(v_ativos))
    );

  RETURN json_build_object(
    'linked_rma_count', v_linked_rma,
    'total_inversores', v_total_inv
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
