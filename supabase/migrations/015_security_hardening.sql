-- Migration 015: endurecimento de segurança (registro do que foi aplicado no Supabase).
--
-- Estes comandos já foram executados manualmente no SQL Editor e deixaram o
-- Security Advisor com 0 erros e 0 avisos. Este arquivo existe para que um banco
-- recriado a partir das migrations chegue ao mesmo estado.
--
-- COMO RODAR: o SQL Editor do Supabase pode executar só parte do texto colado.
-- Rode UMA instrução por vez (ou selecione tudo com Ctrl+A antes de Run).
-- Tudo aqui é idempotente, exceto que REVOKE/GRANT/ALTER exigem que a função exista.
--
-- Pré-requisito: o servidor da dashboard usa SUPABASE_SERVICE_ROLE_KEY. Se ela não
-- estiver configurada, os REVOKE abaixo derrubariam a dashboard.
-- Para desfazer: GRANT EXECUTE ON FUNCTION <assinatura> TO anon, authenticated;

-- 1) Views SECURITY DEFINER não utilizadas (Advisor: CRITICAL)
DROP VIEW IF EXISTS public.v_taxa_falha_modelo;
DROP VIEW IF EXISTS public.v_top_defeitos;
DROP VIEW IF EXISTS public.v_distribuicao_regional;

-- 2) Versões antigas da função de coorte (só a de 5 parâmetros é usada pelo app)
DROP FUNCTION IF EXISTS public.rma_taxa_por_coorte_venda(date, date);
DROP FUNCTION IF EXISTS public.rma_taxa_por_coorte_venda(date, date, text[], text[]);

-- 3) Funções SECURITY DEFINER: só o servidor (service_role) pode executar
REVOKE EXECUTE ON FUNCTION public.truncate_import_table(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.truncate_import_table(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_produtos_ativos(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_produtos_ativos(date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_vendas_filtered(date, date, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendas_filtered(date, date, text[], text[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rma_taxa_por_coorte_venda(date, date, text[], text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rma_taxa_por_coorte_venda(date, date, text[], text[], boolean) TO service_role;

-- 4) search_path fixo nas funções (Advisor: Function Search Path Mutable)
ALTER FUNCTION public.truncate_import_table(text) SET search_path = public;
ALTER FUNCTION public.get_produtos_ativos(date) SET search_path = public;
ALTER FUNCTION public.get_vendas_filtered(date, date, text[], text[]) SET search_path = public;
ALTER FUNCTION public.rma_taxa_por_coorte_venda(date, date, text[], text[], boolean) SET search_path = public;
ALTER FUNCTION public.norm_kw(numeric) SET search_path = public;
