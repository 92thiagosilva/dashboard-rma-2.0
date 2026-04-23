import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars ausentes");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

const ALLOWED_TABLES: Record<string, string[]> = {
  analytics: ["vendas", "rma"],
  estoque: ["estoque_danificado"],
  all: ["vendas", "rma", "estoque_danificado"],
};

export async function POST(req: NextRequest) {
  try {
    const { scope } = await req.json() as { scope: string };
    const tables = ALLOWED_TABLES[scope];
    if (!tables) {
      return NextResponse.json({ error: "Scope inválido" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const errors: string[] = [];

    for (const table of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("truncate_import_table", { p_table: table });
      if (error) {
        console.error(`[clear] Erro ao limpar ${table}:`, error);
        errors.push(`${table}: ${error.message}`);
      } else {
        console.log(`[clear] Tabela ${table} limpa`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
    }

    return NextResponse.json({ success: true, cleared: tables });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[clear] Erro:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
