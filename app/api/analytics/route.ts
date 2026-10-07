import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const dateStart = searchParams.get("dateStart");
  const dateEnd = searchParams.get("dateEnd");
  const fabricantes = searchParams.get("fabricantes")?.split(",").filter(Boolean) ?? [];
  const modelos = searchParams.get("modelos")?.split(",").filter(Boolean) ?? [];
  const classificacoes = searchParams.get("classificacoes")?.split(",").filter(Boolean) ?? [];
  const apenasAtivos = searchParams.get("apenasAtivos") === "1";

  const supabase = createServerClient();

  try {
    if (type === "power-map") {
      // Mapa produto(normalizado) -> potência (kW), a partir de rma.potencia.
      // Usado para visualização em kW. Pega a potência mais frequente por produto.
      const { data, error } = await supabase
        .from("rma")
        .select("produto, potencia")
        .not("produto", "is", null)
        .not("potencia", "is", null);
      if (error) {
        console.error("[analytics/power-map] Erro:", error);
        return NextResponse.json({ map: {} });
      }
      type Row = { produto: string | null; potencia: number | null };
      const counts: Record<string, Record<string, number>> = {};
      for (const r of (data ?? []) as Row[]) {
        if (!r.produto || r.potencia == null) continue;
        const key = r.produto.toUpperCase().trim();
        const pot = String(r.potencia);
        (counts[key] ??= {})[pot] = (counts[key]?.[pot] ?? 0) + 1;
      }
      const map: Record<string, number> = {};
      for (const key in counts) {
        // potência mais frequente para o produto
        let best = ""; let bestN = -1;
        for (const pot in counts[key]) {
          if (counts[key][pot] > bestN) { bestN = counts[key][pot]; best = pot; }
        }
        const num = parseFloat(best);
        if (isFinite(num) && num > 0) map[key] = num;
      }
      return NextResponse.json({ map });
    }

    if (type === "active-products") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_produtos_ativos", {
        p_date_end: dateEnd || null,
      });
      if (error) {
        console.error("[analytics/active-products] Erro no RPC:", error);
        return NextResponse.json({ produtos: [] });
      }
      const produtos = ((data ?? []) as Array<{ descricao_produto: string }>)
        .map((r) => r.descricao_produto)
        .filter(Boolean);
      return NextResponse.json({ produtos });
    }

    if (type === "tree-catalog") {
      // Catálogo de produtos que já tiveram RMA em qualquer data (sem filtro de período).
      // A árvore por fabricante usa isto para listar também os produtos vendidos no período
      // cujos RMAs foram abertos fora dele — senão os filhos não fecham com o pai.
      const { data, error } = await supabase
        .from("rma")
        .select("fabricante, produto, tipo_alimentacao, potencia")
        .not("produto", "is", null)
        .not("fabricante", "is", null)
        .limit(20000);
      if (error) {
        console.error("[analytics/tree-catalog] Erro:", error);
        return NextResponse.json({ rows: null, error: error.message });
      }
      type Row = { fabricante: string; produto: string; tipo_alimentacao: string | null; potencia: number | null };
      const seen = new Set<string>();
      const rows: Row[] = [];
      for (const r of (data ?? []) as Row[]) {
        const k = `${r.fabricante}|${r.produto}|${r.tipo_alimentacao ?? ""}|${r.potencia ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(r);
      }
      return NextResponse.json({ rows });
    }

    if (type === "vendas-mensal") {
      // Vendas agregadas por mês e produto (sem o limite de 120k linhas do cliente).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("vendas_mensal", {
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
        p_fabricantes: fabricantes.length > 0 ? fabricantes : null,
        p_modelos: modelos.length > 0 ? modelos : null,
      });
      if (error) {
        console.error("[analytics/vendas-mensal] Erro no RPC:", error);
        return NextResponse.json({ rows: null, error: error.message ?? String(error) });
      }
      return NextResponse.json({ rows: data ?? [] });
    }

    if (type === "cohort") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("rma_taxa_por_coorte_venda", {
        p_date_start: dateStart || null,
        p_date_end: dateEnd || null,
        p_fabricantes: fabricantes.length > 0 ? fabricantes : null,
        p_modelos: modelos.length > 0 ? modelos : null,
        p_apenas_ativos: apenasAtivos,
      });

      if (error) {
        console.error("[analytics/cohort] Erro no RPC:", error);
        return NextResponse.json({
          linkedRMACount: 0, totalInversores: 0, taxa: 0,
          _rpcError: error.message ?? String(error),
        });
      }

      const result = data as {
        linked_rma_count: number;
        total_inversores: number;
        linked_rma_kw?: number;
        total_inversores_kw?: number;
      };
      const taxa =
        result.total_inversores > 0
          ? (result.linked_rma_count / result.total_inversores) * 100
          : 0;

      // Campos kW só existem após a migration 008 — passamos adiante se presentes.
      const temKw = result.total_inversores_kw != null || result.linked_rma_kw != null;
      const linkedKw = result.linked_rma_kw ?? 0;
      const invKw = result.total_inversores_kw ?? 0;
      const taxaKw = invKw > 0 ? (linkedKw / invKw) * 100 : 0;

      return NextResponse.json({
        linkedRMACount: result.linked_rma_count ?? 0,
        totalInversores: result.total_inversores ?? 0,
        taxa,
        ...(temKw ? { linkedRMAKw: linkedKw, totalInversoresKw: invKw, taxaKw } : {}),
      });
    }

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

    // Build RMA query — limit 20k para não travar sem filtros
    let rmaQuery = supabase.from("rma").select("*").limit(20000);
    if (dateStart) rmaQuery = rmaQuery.gte("data_criacao", dateStart);
    if (dateEnd) rmaQuery = rmaQuery.lte("data_criacao", dateEnd);
    if (fabricantes.length > 0) rmaQuery = rmaQuery.in("fabricante", fabricantes);
    if (modelos.length > 0) rmaQuery = rmaQuery.in("produto", modelos);
    if (classificacoes.length > 0) rmaQuery = rmaQuery.in("classificacao", classificacoes);

    // Build Vendas query — quando fabricante/modelo está filtrado, usa RPC server-side
    // para evitar: (1) limite de 120k rows, (2) mismatch de case nos nomes de produto.
    // Sem filtro: query direta com limit 120k (todos os fabricantes).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vendasPromise = (fabricantes.length > 0 || modelos.length > 0)
      ? (supabase as any).rpc("get_vendas_filtered", {
          p_date_start: dateStart || null,
          p_date_end:   dateEnd   || null,
          p_fabricantes: fabricantes.length > 0 ? fabricantes : null,
          p_modelos:     modelos.length > 0     ? modelos     : null,
        })
      : (() => {
          // Produtos "KIT ..." (kits de fixação de microinversor) não são o foco da dashboard
          // e ficam fora de todos os cálculos. Linhas sem descrição continuam sendo contadas.
          let q = supabase
            .from("vendas")
            .select("*")
            .or("descricao_produto.is.null,descricao_produto.not.ilike.KIT *")
            .limit(120000);
          if (dateStart) q = q.gte("data_venda", dateStart);
          if (dateEnd)   q = q.lte("data_venda", dateEnd);
          return q;
        })();

    // Executa queries independentemente para evitar falha total se uma tabela tiver problema
    const [rmaResult, vendasResult] = await Promise.all([rmaQuery, vendasPromise]);

    if (rmaResult.error) {
      console.error("[analytics] Erro na query rma:", rmaResult.error);
    }
    if (vendasResult.error) {
      console.error("[analytics] Erro na query vendas:", vendasResult.error);
    }

    // Retorna o que tiver — erros individuais não derrubam o dashboard
    return NextResponse.json({
      rma: rmaResult.data ?? [],
      vendas: vendasResult.data ?? [],
      errors: {
        rma: rmaResult.error?.message ?? null,
        vendas: vendasResult.error?.message ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[analytics] Erro geral:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
