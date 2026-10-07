-- Migration 016: exclui os produtos "KIT ..." de todos os cálculos.
--
-- Os produtos KIT (KIT FIXAÇÃO CCM / PERFIL / SOLAR A+ MICROINVERSOR) são acessórios de
-- fixação, não inversores, e nunca geram RMA. Entravam como "unidades vendidas" (~21%
-- das vendas) e inflavam o denominador de todas as taxas. Os dados continuam na tabela
-- vendas; só deixam de entrar nas contas.
-- Regra única: descrição que começa com "KIT " (ignora maiúsculas e espaços nas pontas).
--
-- COMO RODAR (SQL Editor do Supabase): rode UMA instrução por vez, na ordem.
--   Os blocos 1, 2 e 3 são CREATE OR REPLACE FUNCTION (cada um é uma instrução inteira,
--   do CREATE até o "$$ LANGUAGE ...;"). Depois os REVOKE/GRANT do bloco 4.
-- Depois de rodar, recarregue a dashboard. Para desfazer, rode de novo as versões
-- anteriores (006/007/014/015).
-- Nota: o SET search_path já vai dentro de cada definição, porque CREATE OR REPLACE
-- descarta a configuração anterior da função.

-- 1) Produtos ativos: kits não contam
CREATE OR REPLACE FUNCTION public.get_produtos_ativos(
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
    AND UPPER(TRIM(v.descricao_produto)) NOT LIKE 'KIT %'
    AND v.data_venda >= (v_end - INTERVAL '6 months')
    AND v.data_venda <= v_end
  GROUP BY UPPER(TRIM(v.descricao_produto))
  HAVING SUM(v.quantidade_vendida) > 60;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2) Vendas filtradas por fabricante/modelo: kits não entram
CREATE OR REPLACE FUNCTION public.get_vendas_filtered(
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
      AND COALESCE(UPPER(TRIM(v.descricao_produto)), '') NOT LIKE 'KIT %'
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
      AND (p_date_end   IS NULL OR v.data_venda <= p_date_end)
      AND COALESCE(UPPER(TRIM(v.descricao_produto)), '') NOT LIKE 'KIT %';

  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3) Coorte (inversores e kW vendidos, RMAs vinculados): kits não entram
CREATE OR REPLACE FUNCTION public.rma_taxa_por_coorte_venda(
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

  IF p_apenas_ativos THEN
    SELECT array_agg(t.p) INTO v_ativos
    FROM (
      SELECT UPPER(TRIM(descricao_produto)) AS p
      FROM vendas
      WHERE descricao_produto IS NOT NULL
        AND UPPER(TRIM(descricao_produto)) NOT LIKE 'KIT %'
        AND data_venda >= (COALESCE(p_date_end, CURRENT_DATE) - INTERVAL '6 months')
        AND data_venda <= COALESCE(p_date_end, CURRENT_DATE)
      GROUP BY UPPER(TRIM(descricao_produto))
      HAVING SUM(quantidade_vendida) > 60
    ) t;
    IF v_ativos IS NULL THEN v_ativos := ARRAY[]::text[]; END IF;
  END IF;

  -- Inversores vendidos (contagem)
  SELECT COALESCE(SUM(v.quantidade_vendida), 0)
  INTO v_total_inv
  FROM vendas v
  WHERE (p_date_start IS NULL OR v.data_venda >= p_date_start)
    AND (p_date_end   IS NULL OR v.data_venda <= p_date_end)
    AND COALESCE(UPPER(TRIM(v.descricao_produto)), '') NOT LIKE 'KIT %'
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

  -- Inversores vendidos em kW (potência por produto = moda de rma.potencia)
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
    AND COALESCE(UPPER(TRIM(v.descricao_produto)), '') NOT LIKE 'KIT %'
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

  -- RMAs vinculados (contagem por SAC único)
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
        AND COALESCE(UPPER(TRIM(v.descricao_produto)), '') NOT LIKE 'KIT %'
        AND (NOT p_apenas_ativos OR UPPER(TRIM(v.descricao_produto)) = ANY(v_ativos))
    );

  -- RMAs vinculados em kW (soma da potência, 1 valor por SAC)
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
          AND COALESCE(UPPER(TRIM(v.descricao_produto)), '') NOT LIKE 'KIT %'
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 4) Reafirma as permissões (só o servidor executa; idempotente)
REVOKE EXECUTE ON FUNCTION public.get_produtos_ativos(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_produtos_ativos(date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_vendas_filtered(date, date, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendas_filtered(date, date, text[], text[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rma_taxa_por_coorte_venda(date, date, text[], text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rma_taxa_por_coorte_venda(date, date, text[], text[], boolean) TO service_role;
