-- Migration 012: remove views SECURITY DEFINER não utilizadas.
--
-- O Supabase Advisor marcou 3 views como CRITICAL (Security Definer View):
--   v_taxa_falha_modelo, v_top_defeitos, v_distribuicao_regional
-- Elas foram criadas no 001_schema.sql mas NÃO são consultadas pelo app
-- (taxa por modelo, top defeitos e distribuição regional são calculados
-- no cliente). Removê-las elimina os 3 alertas de segurança.
--
-- Como rodar: Supabase > SQL Editor > cole tudo > Run. Idempotente.

DROP VIEW IF EXISTS public.v_taxa_falha_modelo;
DROP VIEW IF EXISTS public.v_top_defeitos;
DROP VIEW IF EXISTS public.v_distribuicao_regional;
