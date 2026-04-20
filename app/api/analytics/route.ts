import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");
  const stockStatus = searchParams.get("stockStatus") ?? "Todos";
  const fabricantes = searchParams.get("fabricantes")?.split(",").filter(Boolean) ?? [];
  const modelos = searchParams.get("modelos")?.split(",").filter(Boolean) ?? [];
  const classificacoes = searchParams.get("classificacoes")?.split(",").filter(Boolean) ?? [];

  const supabase = createServerClient();

  try {
    if (type === "filters") {
      const sb = supabase as ReturnType<typeof createServerClient>;
      const [r1, r2, r3] = await Promise.all([
        sb.from("rma").select("fabricante"),
        sb.from("rma").select("produto, fabricante"),
        sb.from("rma").select("classificacao"),
      ]);

      type R1 = { fabricante: string | null };
      type R2 = { produto: string | null; fabricante: string | null };
      type R3 = { classificacao: string | null };

      const fabRows = (r1.data ?? []) as R1[];
      const modRows = (r2.data ?? []) as R2[];
      const classRows = (r3.data ?? []) as R3[];

      const fabSet = new Set<string>();
      fabRows.forEach((r) => { if (r.fabricante) fabSet.add(r.fabricante); });
      const fabs = Array.from(fabSet).sort();

      const modMap = new Map<string, string | null>();
      modRows.forEach((r) => { if (r.produto) modMap.set(r.produto, r.fabricante); });
      const mods = Array.from(modMap.entries())
        .map(([produto, fabricante]) => ({ produto, fabricante }))
        .sort((a, b) => a.produto.localeCompare(b.produto));

      const classSet = new Set<string>();
      classRows.forEach((r) => { if (r.classificacao) classSet.add(r.classificacao); });
      const classes = Array.from(classSet).sort();

      return NextResponse.json({ fabricantes: fabs, modelos: mods, classificacoes: classes });
    }

    // Build RMA query
    let rmaQuery = supabase.from("rma").select("*");
    if (dateStart) rmaQuery = rmaQuery.gte("data_criacao", dateStart);
    if (dateEnd) rmaQuery = rmaQuery.lte("data_criacao", dateEnd);
    if (stockStatus !== "Todos") rmaQuery = rmaQuery.eq("ativo", stockStatus);
    if (fabricantes.length > 0) rmaQuery = rmaQuery.in("fabricante", fabricantes);
    if (modelos.length > 0) rmaQuery = rmaQuery.in("produto", modelos);
    if (classificacoes.length > 0) rmaQuery = rmaQuery.in("classificacao", classificacoes);

    // Build Vendas query
    let vendasQuery = supabase.from("vendas").select("*");
    if (dateStart) vendasQuery = vendasQuery.gte("data_venda", dateStart);
    if (dateEnd) vendasQuery = vendasQuery.lte("data_venda", dateEnd);

    const [{ data: rmaData, error: rmaErr }, { data: vendasData, error: vendasErr }] =
      await Promise.all([rmaQuery, vendasQuery]);

    if (rmaErr) throw rmaErr;
    if (vendasErr) throw vendasErr;

    return NextResponse.json({ rma: rmaData ?? [], vendas: vendasData ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
