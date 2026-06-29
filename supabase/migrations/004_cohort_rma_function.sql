-- Função: Taxa de Falha por Coorte de Venda
-- Vincula RMAs (de qualquer época) às vendas do período via nro_fotus = numero_fotus
-- Execute no SQL Editor do Supabase (supabase.com > projeto > SQL Editor)

CREATE OR REPLACE FUNCTION rma_taxa_por_coorte_venda(
  p_date_start date DEFAULT NULL,
  p_date_end date DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_linked_rma   bigint := 0;
  v_total_inv    bigint := 0;
BEGIN
  -- Total de inversores vendidos no período
  SELECT COALESCE(SUM(quantidade_vendida), 0)
  INTO v_total_inv
  FROM vendas
  WHERE (p_date_start IS NULL OR data_venda >= p_date_start)
    AND (p_date_end   IS NULL OR data_venda <= p_date_end);

  -- RMAs vinculados às vendas do período (sem filtro de data no RMA)
  -- Deduplica por SAC quando disponível (consistente com a lógica de KPI global)
  SELECT COUNT(DISTINCT COALESCE(r.sac, r.id::text))
  INTO v_linked_rma
  FROM rma r
  WHERE r.nro_fotus IS NOT NULL
    AND r.nro_fotus IN (
      SELECT numero_fotus
      FROM vendas
      WHERE numero_fotus IS NOT NULL
        AND (p_date_start IS NULL OR data_venda >= p_date_start)
        AND (p_date_end   IS NULL OR data_venda <= p_date_end)
    );

  RETURN json_build_object(
    'linked_rma_count', v_linked_rma,
    'total_inversores',  v_total_inv
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
