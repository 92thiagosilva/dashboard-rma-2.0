import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const CHUNK_SIZE = 500;

async function upsertChunks<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createServerClient>,
  table: string,
  rows: T[]
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk as never);
    if (error) throw new Error(`Erro ao inserir em ${table}: ${error.message}`);
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

    const supabase = createServerClient();
    let rowsImported = 0;

    if (type === "vendas") {
      rowsImported = await upsertChunks(supabase, "vendas", rows);
    } else if (type === "rma") {
      rowsImported = await upsertChunks(supabase, "rma", rows);
    } else if (type === "estoque") {
      rowsImported = await upsertChunks(supabase, "estoque_danificado", rows);
    } else if (type === "mttf") {
      // mttf usa upsert por produto (primary key)
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from("mttf_referencia")
          .upsert(chunk as never, { onConflict: "produto" });
        if (error) throw new Error(error.message);
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

    return NextResponse.json({ success: true, rowsImported });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
