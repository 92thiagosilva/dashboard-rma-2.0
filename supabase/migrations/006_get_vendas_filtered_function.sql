-- Retorna vendas filtradas por fabricante/modelo via join com rma (UPPER TRIM)
-- Usado pela API route quando fabricante/modelo está selecionado, para evitar
-- o problema de limite de linhas (120k) e inconsistência de case nos nomes

CREATE OR REPLACE FUNCTION get_vendas_filtered(
  p_date_start  date   DEFAULT NULL,
  p_date_end    date   DEFAULT NULL,
  p_fabricantes text[] DEFAULT NULL,
  p_modelos     text[] DEFAULT NULL
)
RETURNS SETOF vendas AS $$
BEGIN
  IF (p_fabricantes IS NOT NULL AND array_length(p_fabricantes, 1) > 0)
     OR (p_modelos IS NOT NULL AND array_length(p_modelos, 1) > 0) THEN

    RETURN QUERY
    SELECT v.*
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

  ELSE

    RETURN QUERY
    SELECT v.*
    FROM vendas v
    WHERE (p_date_start IS NULL OR v.data_venda >= p_date_start)
      AND (p_date_end   IS NULL OR v.data_venda <= p_date_end);

  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
