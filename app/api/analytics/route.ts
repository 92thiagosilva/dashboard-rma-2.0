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
      const [{ data: fabData }, { data: modData }, { data: classData }] = await Promise.all([
        supabase.from("rma").select("fabricante").not("fabricante", "is", null),
        supabase.from("rma").select("produto, fabricante").not("produto", "is", null),
        supabase.from("rma").select("classificacao").not("classificacao", "is", null),
      ]);

      const fabs = [...new Set(fabData?.map((r) => r.fabricante).filter(Boolean))].sort();
      const mods = [...new Map(modData?.map((r) => [r.produto, r.fabricante]) ?? []).entries()]
        .map(([prod, fab]) => ({ produto: prod, fabricante: fab }))
        .sort((a, b) => (a.produto ?? "").localeCompare(b.produto ?? ""));
      const classes = [...new Set(classData?.map((r) => r.classificacao).filter(Boolean))].sort();

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
