-- Dashboard RMA — Fotus Energia Solar
-- Execute este SQL no SQL Editor do Supabase (supabase.com > projeto > SQL Editor)

-- Tabela de Vendas
CREATE TABLE IF NOT EXISTS vendas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  data_venda date,
  cod_produto text,
  descricao_produto text,
  quantidade_vendida integer DEFAULT 1,
  estado char(2),
  numero_fotus text,
  imported_at timestamptz DEFAULT now()
);

-- Tabela de RMA
-- Nota: mttf_dias é calculado automaticamente como (data_criacao - data_venda)
CREATE TABLE IF NOT EXISTS rma (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cod_produto text,
  data_criacao date,
  data_venda date,
  sn text,
  estado char(2),
  problematica text,
  nro_fotus text,
  produto text,
  classificacao text,
  tipo_alimentacao text,
  potencia integer,
  fabricante text,
  ativo text DEFAULT 'Não',
  imported_at timestamptz DEFAULT now()
);

-- Coluna calculada MTTF (dias entre venda e abertura do RMA)
ALTER TABLE rma ADD COLUMN IF NOT EXISTS mttf_dias integer
  GENERATED ALWAYS AS (
    CASE
      WHEN data_criacao IS NOT NULL AND data_venda IS NOT NULL
        AND data_criacao >= data_venda
      THEN (data_criacao - data_venda)
      ELSE NULL
    END
  ) STORED;

-- Tabela de Estoque Danificado
CREATE TABLE IF NOT EXISTS estoque_danificado (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sn text,
  cod_produto text,
  produto text,
  fabricante text,
  sac text,
  cd text,
  empresa text,
  tipo text,
  status text,
  previsao_envio date,
  nf_retorno text,
  nf_envio_fabricante text,
  data_envio date,
  imported_at timestamptz DEFAULT now()
);

-- Tabela MTTF de referência (planilha pré-calculada)
CREATE TABLE IF NOT EXISTS mttf_referencia (
  produto text PRIMARY KEY,
  media_mttf numeric,
  ativo text
);

-- Histórico de importações
CREATE TABLE IF NOT EXISTS import_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text,
  filename text,
  rows_imported integer,
  imported_at timestamptz DEFAULT now()
);

-- Índices para performance nas queries do dashboard
CREATE INDEX IF NOT EXISTS idx_rma_data_criacao ON rma(data_criacao);
CREATE INDEX IF NOT EXISTS idx_rma_fabricante ON rma(fabricante);
CREATE INDEX IF NOT EXISTS idx_rma_produto ON rma(produto);
CREATE INDEX IF NOT EXISTS idx_rma_estado ON rma(estado);
CREATE INDEX IF NOT EXISTS idx_rma_ativo ON rma(ativo);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_produto ON vendas(descricao_produto);
CREATE INDEX IF NOT EXISTS idx_vendas_estado ON vendas(estado);
CREATE INDEX IF NOT EXISTS idx_estoque_status ON estoque_danificado(status);
CREATE INDEX IF NOT EXISTS idx_estoque_fabricante ON estoque_danificado(fabricante);
CREATE INDEX IF NOT EXISTS idx_estoque_tipo ON estoque_danificado(tipo);

-- As views v_taxa_falha_modelo, v_top_defeitos e v_distribuicao_regional foram
-- removidas: não eram usadas pelo app (os cálculos são feitos no cliente) e o
-- Supabase Advisor as marcava como CRITICAL (Security Definer View).
-- Veja 012_drop_security_definer_views.sql.
