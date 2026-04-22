-- Função segura para truncar apenas as tabelas de importação
-- Chamada pela API de import quando o usuário reimporta uma planilha
CREATE OR REPLACE FUNCTION truncate_import_table(p_table text)
RETURNS void AS $$
BEGIN
  IF p_table IN ('vendas', 'rma', 'estoque_danificado', 'mttf_referencia') THEN
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(p_table);
  ELSE
    RAISE EXCEPTION 'Tabela não permitida para truncate: %', p_table;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
