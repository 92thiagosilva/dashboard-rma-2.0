-- Migration 017: vendas agregadas por mês e produto (alimenta a linha do tempo).
--
-- A linha do tempo somava as vendas no navegador, que só recebe até 120.000 linhas.
-- Em períodos longos isso cortava os meses mais antigos/recentes. Esta função agrega no
-- servidor (poucas linhas: meses x produtos) e respeita os mesmos filtros e a exclusão de
-- kits de get_vendas_filtered.
--
-- COMO RODAR (SQL Editor do Supabase): selecione o CREATE inteiro, rode, depois rode o
-- REVOKE/GRANT.

CREATE OR REPLACE FUNCTION public.vendas_mensal(
  p_date_start  date   DEFAULT NULL,
  p_date_end    date   DEFAULT NULL,
  p_fabricantes text[] DEFAULT NULL,
  p_modelos     text[] DEFAULT NULL
)
RETURNS TABLE(mes text, produto text, qtd bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT to_char(v.data_venda, 'YYYY-MM') AS mes,
         UPPER(TRIM(v.descricao_produto)) AS produto,
         COALESCE(SUM(v.quantidade_vendida), 0)::bigint AS qtd
  FROM public.get_vendas_filtered(p_date_start, p_date_end, p_fabricantes, p_modelos) v
  WHERE v.data_venda IS NOT NULL
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.vendas_mensal(date, date, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vendas_mensal(date, date, text[], text[]) TO service_role;
