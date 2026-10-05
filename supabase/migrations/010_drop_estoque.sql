-- Migration 010: remove a parte de Estoque do banco.
-- A seção de Estoque da dashboard foi descontinuada (código e UI removidos).
--
-- Como rodar: Supabase > SQL Editor > cole tudo > Run. Idempotente.

-- Remove a tabela de estoque danificado
DROP TABLE IF EXISTS estoque_danificado;

-- Atualiza a função de truncate para não permitir mais 'estoque_danificado'
CREATE OR REPLACE FUNCTION truncate_import_table(p_table text)
RETURNS void AS $$
BEGIN
  IF p_table IN ('vendas', 'rma', 'mttf_referencia') THEN
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(p_table);
  ELSE
    RAISE EXCEPTION 'Tabela não permitida para truncate: %', p_table;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
