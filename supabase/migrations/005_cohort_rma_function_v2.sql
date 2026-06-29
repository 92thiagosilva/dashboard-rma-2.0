-- Atualiza função com suporte a filtros de fabricante e modelo
-- A tabela vendas não tem coluna fabricante, então o match é feito via
-- UPPER(vendas.descricao_produto) = UPPER(rma.produto) para os fabricantes filtrados

CREATE OR REPLACE FUNCTION rma_taxa_por_coorte_venda(
  p_date_start  date    DEFAULT NULL,
  p_date_end    date    DEFAULT NULL,
  p_fabricantes text[]  DEFAULT NULL,
  p_modelos     text[]  DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_linked_rma  bigint  := 0;
  v_total_inv   bigint  := 0;
  v_has_filter  boolean;
BEGIN
  v_has_filter := (
    (p_fabricantes IS NOT NULL AND array_length(p_fabricantes, 1) > 0)
    OR (p_modelos IS NOT NULL AND array_length(p_modelos, 1) > 0)
  );

  IF v_has_filter THEN
    -- Derivar os produtos ativos a partir do filtro de fabricante/modelo na tabela rma
    -- e fazer match com vendas.descricao_produto (case-insensitive)
    SELECT COALESCE(SUM(v.quantidade_vendida), 0)
    INTO v_total_inv
    FROM vendas v
    WHERE (p_date_start IS NULL OR v.data_venda >= p_date_start)
      AND (p_date_end   IS NULL OR v.data_venda <= p_date_end)
      AND UPPER(TRIM(v.descricao_produto)) IN (
        SELECT DISTINCT UPPER(TRIM(r.produto))
        FROM rma r
        WHERE r.produto IS NOT NULL
          AND (p_fabricantes IS NULL OR array_length(p_fabricantes, 1) = 0 OR r.fabricante = ANY(p_fabricantes))
          AND (p_modelos     IS NULL OR array_length(p_modelos,     1) = 0 OR r.produto    = ANY(p_modelos))
      );

    SELECT COUNT(DISTINCT COALESCE(r.sac, r.id::text))
    INTO v_linked_rma
    FROM rma r
    WHERE r.nro_fotus IS NOT NULL
      AND (p_fabricantes IS NULL OR array_length(p_fabricantes, 1) = 0 OR r.fabricante = ANY(p_fabricantes))
      AND (p_modelos     IS NULL OR array_length(p_modelos,     1) = 0 OR r.produto    = ANY(p_modelos))
      AND r.nro_fotus IN (
        SELECT v.numero_fotus
        FROM vendas v
        WHERE v.numero_fotus IS NOT NULL
          AND (p_date_start IS NULL OR v.data_venda >= p_date_start)
          AND (p_date_end   IS NULL OR v.data_venda <= p_date_end)
          AND UPPER(TRIM(v.descricao_produto)) IN (
            SELECT DISTINCT UPPER(TRIM(r2.produto))
            FROM rma r2
            WHERE r2.produto IS NOT NULL
              AND (p_fabricantes IS NULL OR array_length(p_fabricantes, 1) = 0 OR r2.fabricante = ANY(p_fabricantes))
              AND (p_modelos     IS NULL OR array_length(p_modelos,     1) = 0 OR r2.produto    = ANY(p_modelos))
          )
      );

  ELSE
    -- Sem filtro de fabricante/modelo: soma todos os inversores do período
    SELECT COALESCE(SUM(quantidade_vendida), 0)
    INTO v_total_inv
    FROM vendas
    WHERE (p_date_start IS NULL OR data_venda >= p_date_start)
      AND (p_date_end   IS NULL OR data_venda <= p_date_end);

    SELECT COUNT(DISTINCT COALESCE(r.sac, r.id::text))
    INTO v_linked_rma
    FROM rma r
    WHERE r.nro_fotus IS NOT NULL
      AND r.nro_fotus IN (
        SELECT numero_fotus FROM vendas
        WHERE numero_fotus IS NOT NULL
          AND (p_date_start IS NULL OR data_venda >= p_date_start)
          AND (p_date_end   IS NULL OR data_venda <= p_date_end)
      );
  END IF;

  RETURN json_build_object(
    'linked_rma_count', v_linked_rma,
    'total_inversores',  v_total_inv
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
