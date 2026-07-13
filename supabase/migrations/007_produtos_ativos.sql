-- Filtro "Apenas produtos ativos"
-- Regra: produto é ATIVO se teve SUM(quantidade_vendida) > 10 nos 6 meses
-- anteriores à data final filtrada (ou hoje, se não houver data final).
-- Produtos inativos são excluídos de todos os cálculos da dashboard.

-- 1) Retorna os nomes de produto ATIVOS (normalizados UPPER/TRIM) para o
--    filtro client-side no store (rmaData / vendasData).
CREATE OR REPLACE FUNCTION get_produtos_ativos(
  p_date_end date DEFAULT NULL
)
RETURNS TABLE(descricao_produto text) AS $$
DECLARE
  v_end date := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
  RETURN QUERY
  SELECT UPPER(TRIM(v.descricao_produto)) AS descricao_produto
  FROM vendas v
  WHERE v.descricao_produto IS NOT NULL
    AND v.data_venda >= (v_end - INTERVAL '6 months')
    AND v.data_venda <= v_end
  GROUP BY UPPER(TRIM(v.descricao_produto))
  HAVING SUM(v.quantidade_vendida) > 10;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 2) Cohort v3: adiciona parâmetro p_apenas_ativos. Quando true, aplica a mesma
--    regra de 6 meses (via p_date_end) às vendas e RMAs contabilizados.
--    Também unifica a lógica de fabricante/modelo (remove o IF/ELSE anterior).
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

  -- Conjunto de produtos ativos (6 meses antes de p_date_end)
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

  -- Total de inversores vendidos no período (com filtros aplicados)
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

  -- RMAs vinculados às vendas do período (RMA de qualquer data)
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
