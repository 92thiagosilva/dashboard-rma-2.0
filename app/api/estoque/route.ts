import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status")?.split(",").filter(Boolean) ?? [];
  const fabricantes = searchParams.get("fabricantes")?.split(",").filter(Boolean) ?? [];
  const tipos = searchParams.get("tipos")?.split(",").filter(Boolean) ?? [];
  const search = searchParams.get("search") ?? "";

  const supabase = createServerClient();

  try {
    let query = supabase.from("estoque_danificado").select("*");
    if (status.length > 0) query = query.in("status", status);
    if (fabricantes.length > 0) query = query.in("fabricante", fabricantes);
    if (tipos.length > 0) query = query.in("tipo", tipos);
    if (search) query = query.or(`produto.ilike.%${search}%,sn.ilike.%${search}%`);

    const { data, error } = await query.order("imported_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
