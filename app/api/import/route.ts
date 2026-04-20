import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const CHUNK_SIZE = 100;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars ausentes");
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          // 60s timeout para inserções grandes
          signal: AbortSignal.timeout(60_000),
        }),
    },
  });
}

async function upsertChunks<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  rows: T[]
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(table)
      .insert(chunk as never)
      .select("id");

    if (error) {
      console.error(`[import] Erro no chunk ${i / CHUNK_SIZE + 1} de ${table}:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw new Error(`Erro ao inserir em ${table}: ${error.message}`);
    }
    inserted += chunk.length;
  }
  return inserted;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, rows, filename } = body as {
      type: string;
      rows: Record<string, unknown>[];
      filename: string;
    };

    if (!type || !rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    console.log(`[import] Iniciando: type=${type} rows=${rows.length} file=${filename}`);

    const supabase = createAdminClient();
    let rowsImported = 0;

    if (type === "vendas") {
      rowsImported = await upsertChunks(supabase, "vendas", rows);
    } else if (type === "rma") {
      rowsImported = await upsertChunks(supabase, "rma", rows);
    } else if (type === "estoque") {
      rowsImported = await upsertChunks(supabase, "estoque_danificado", rows);
    } else if (type === "mttf") {
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from("mttf_referencia")
          .upsert(chunk as never, { onConflict: "produto" });
        if (error) {
          console.error(`[import] Erro MTTF chunk ${i}:`, error);
          throw new Error(error.message);
        }
        rowsImported += chunk.length;
      }
    } else {
      return NextResponse.json({ error: "Tipo de arquivo não reconhecido" }, { status: 400 });
    }

    await supabase.from("import_history").insert({
      tipo: type,
      filename,
      rows_imported: rowsImported,
    });

    console.log(`[import] Concluído: ${rowsImported} linhas inseridas em ${type}`);
    return NextResponse.json({ success: true, rowsImported });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[import] Erro geral:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
