-- Migration 008: adiciona valores em kW (potência) à função de coorte.
-- Permite que o card "Taxa de Falha por Coorte de Venda" e a tabela
-- "Taxas por Fabricante Selecionado" respeitem o toggle Inversores / kW.
--
-- Como rodar: Supabase > SQL Editor > cole este arquivo inteiro > Run.
-- É idempotente (CREATE OR REPLACE) — pode rodar quantas vezes quiser.

-- Normaliza potência para kW (se vier em watts, divide por 1000).
CREATE OR REPLACE FUNCTION norm_kw(p numeric)
RETURNS numeric AS $$
  SELECT CASE
    WHEN p IS NULL OR p <= 0 THEN 0
    WHEN p > 1000 THEN p / 1000.0
    ELSE p
  END;
$$ LANGUAGE sql IMMUTABLE;


CREATE OR REPLACE FUNCTION rma_taxa_por_coorte_venda(
  p_date_start    date    DEFAULT NULL,
  p_date_end      date    DEFAULT NULL,
  p_fabricantes   text[]  DEFAULT NULL,
  p_modelos       text[]  DEFAULT NULL,
  p_apenas_ativos boolean DEFAULT false
)
RETURNS json AS $$
DECLARE
  v_linked_rma     bigint  := 0;
  v_total_inv      bigint  := 0;
  v_linked_rma_kw  numeric := 0;
  v_total_inv_kw   numeric := 0;
  v_has_filter     boolean;
  v_ativos         text[];
BEGIN
  v_has_filter := (
    (p_fabricantes IS NOT NULL AND array_length(p_fabricantes, 1) > 0)
    OR (p_modelos IS NOT NULL AND array_length(p_modelos, 1) > 0)
  );

  -- Produtos ativos (6 meses antes de p_date_end)
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

  -- ===== Inversores (contagem) =====
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

  -- ===== Inversores em kW (potência) =====
  -- Potência por produto = moda de rma.potencia (normalizada p/ kW).
  SELECT COALESCE(SUM(v.quantidade_vendida * norm_kw(pot.kw)), 0)
  INTO v_total_inv_kw
  FROM vendas v
  JOIN (
    SELECT UPPER(TRIM(produto)) AS p,
           mode() WITHIN GROUP (ORDER BY potencia) AS kw
    FROM rma
    WHERE produto IS NOT NULL AND potencia IS NOT NULL
    GROUP BY UPPER(TRIM(produto))
  ) pot ON pot.p = UPPER(TRIM(v.descricao_produto))
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

  -- ===== RMAs vinculados (contagem por SAC único) =====
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

  -- ===== RMAs vinculados em kW (soma da potência, 1 valor por SAC) =====
  SELECT COALESCE(SUM(sac_kw), 0)
  INTO v_linked_rma_kw
  FROM (
    SELECT norm_kw(MAX(r.potencia)) AS sac_kw
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
      )
    GROUP BY COALESCE(r.sac, r.id::text)
  ) t;

  RETURN json_build_object(
    'linked_rma_count',    v_linked_rma,
    'total_inversores',    v_total_inv,
    'linked_rma_kw',       ROUND(v_linked_rma_kw, 2),
    'total_inversores_kw', ROUND(v_total_inv_kw, 2)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
