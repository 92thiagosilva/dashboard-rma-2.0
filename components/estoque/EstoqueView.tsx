"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Package, MagnifyingGlass, FunnelSimple, CaretLeft, CaretRight, X,
} from "@phosphor-icons/react";
import { HorizontalBarChart } from "@/components/dashboard/HorizontalBar";
import { useDashboard } from "@/lib/store";

interface EstoqueRow {
  id: string;
  sn: string | null;
  cod_produto: string | null;
  produto: string | null;
  fabricante: string | null;
  sac: string | null;
  cd: string | null;
  empresa: string | null;
  tipo: string | null;
  status: string | null;
  previsao_envio: string | null;
  nf_retorno: string | null;
  nf_envio_fabricante: string | null;
  data_envio: string | null;
}

const STATUS_ORDER = ["1-RECEBIDO NO CD", "2-SEPARADO PARA ENVIO", "3-ENVIADO"];
const STATUS_LABELS: Record<string, string> = {
  "1-RECEBIDO NO CD": "Recebido no CD",
  "2-SEPARADO PARA ENVIO": "Separado p/ Envio",
  "3-ENVIADO": "Enviado",
};
const STATUS_CLASS: Record<string, string> = {
  "1-RECEBIDO NO CD": "badge-recebido",
  "2-SEPARADO PARA ENVIO": "badge-separado",
  "3-ENVIADO": "badge-enviado",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const PAGE_SIZE = 30;

export function EstoqueView() {
  const { estoqueFilters, setEstoqueFilterOptions } = useDashboard();

  const [allData, setAllData] = useState<EstoqueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  // Fetch all data once (no server-side filters — client-side is fast for ~2107 rows)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque");
      const json = await res.json();
      const rows: EstoqueRow[] = json.data ?? [];
      setAllData(rows);

      // Derive filter options from full dataset and push to store for Sidebar
      const fabs = new Set<string>();
      const tipos = new Set<string>();
      const empresas = new Set<string>();
      rows.forEach((r) => {
        if (r.fabricante) fabs.add(r.fabricante);
        if (r.tipo) tipos.add(r.tipo);
        const emp = r.empresa ?? r.cd;
        if (emp) empresas.add(emp);
      });
      setEstoqueFilterOptions({
        fabricantes: [...fabs].sort(),
        tipos: [...tipos].sort(),
        empresas: [...empresas].sort(),
      });
    } catch {
      setAllData([]);
    } finally {
      setLoading(false);
    }
  }, [setEstoqueFilterOptions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [estoqueFilters, selectedStatus, search]);

  // Client-side filtering
  const filteredData = useMemo(() => {
    let rows = allData;

    // Status filter
    if (selectedStatus.length > 0) {
      rows = rows.filter((r) => r.status && selectedStatus.includes(r.status));
    }

    // Fabricante filter (from sidebar)
    if (estoqueFilters.fabricantes.length > 0) {
      rows = rows.filter((r) => r.fabricante && estoqueFilters.fabricantes.includes(r.fabricante));
    }

    // Tipo filter (from sidebar)
    if (estoqueFilters.tipos.length > 0) {
      rows = rows.filter((r) => r.tipo && estoqueFilters.tipos.includes(r.tipo));
    }

    // Empresa/CD filter (from sidebar)
    if (estoqueFilters.empresas.length > 0) {
      rows = rows.filter((r) => {
        const emp = r.empresa ?? r.cd;
        return emp && estoqueFilters.empresas.includes(emp);
      });
    }

    // Previsão de Envio date range filter (from sidebar)
    if (estoqueFilters.previsaoStart) {
      rows = rows.filter((r) => r.previsao_envio && r.previsao_envio >= estoqueFilters.previsaoStart);
    }
    if (estoqueFilters.previsaoEnd) {
      rows = rows.filter((r) => r.previsao_envio && r.previsao_envio <= estoqueFilters.previsaoEnd);
    }

    // Text search (produto or SN)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          (r.produto ?? "").toLowerCase().includes(q) ||
          (r.sn ?? "").toLowerCase().includes(q) ||
          (r.sac ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [allData, selectedStatus, estoqueFilters, search]);

  const statusCounts = useMemo(() => {
    const sc: Record<string, number> = {};
    // Count from full data so status badges show totals regardless of status filter
    const base = (() => {
      let rows = allData;
      if (estoqueFilters.fabricantes.length > 0)
        rows = rows.filter((r) => r.fabricante && estoqueFilters.fabricantes.includes(r.fabricante));
      if (estoqueFilters.tipos.length > 0)
        rows = rows.filter((r) => r.tipo && estoqueFilters.tipos.includes(r.tipo));
      if (estoqueFilters.empresas.length > 0)
        rows = rows.filter((r) => {
          const emp = r.empresa ?? r.cd;
          return emp && estoqueFilters.empresas.includes(emp);
        });
      if (estoqueFilters.previsaoStart)
        rows = rows.filter((r) => r.previsao_envio && r.previsao_envio >= estoqueFilters.previsaoStart);
      if (estoqueFilters.previsaoEnd)
        rows = rows.filter((r) => r.previsao_envio && r.previsao_envio <= estoqueFilters.previsaoEnd);
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        rows = rows.filter(
          (r) => (r.produto ?? "").toLowerCase().includes(q) || (r.sn ?? "").toLowerCase().includes(q)
        );
      }
      return rows;
    })();
    base.forEach((r) => {
      if (r.status) sc[r.status] = (sc[r.status] ?? 0) + 1;
    });
    return sc;
  }, [allData, estoqueFilters, search]);

  const kpis = useMemo(() => ({
    total: filteredData.length,
    recebido: filteredData.filter((r) => r.status === "1-RECEBIDO NO CD").length,
    separado: filteredData.filter((r) => r.status === "2-SEPARADO PARA ENVIO").length,
    enviado: filteredData.filter((r) => r.status === "3-ENVIADO").length,
    comPrevisao: filteredData.filter((r) => r.previsao_envio).length,
  }), [filteredData]);

  const fabChart = useMemo(() =>
    Object.entries(
      filteredData.reduce<Record<string, number>>((acc, r) => {
        if (r.fabricante) acc[r.fabricante] = (acc[r.fabricante] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, displayValue: value })),
  [filteredData]);

  const tipoChart = useMemo(() =>
    Object.entries(
      filteredData.reduce<Record<string, number>>((acc, r) => {
        if (r.tipo) acc[r.tipo] = (acc[r.tipo] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, displayValue: value })),
  [filteredData]);

  // Count active sidebar filters for badge
  const activeSidebarFilters =
    estoqueFilters.fabricantes.length +
    estoqueFilters.tipos.length +
    estoqueFilters.empresas.length +
    (estoqueFilters.previsaoStart ? 1 : 0) +
    (estoqueFilters.previsaoEnd ? 1 : 0);

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const pageData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        {[
          { label: "Total Danificado", value: kpis.total, accent: "slate" },
          { label: "Recebido no CD", value: kpis.recebido, accent: "blue" },
          { label: "Separado p/ Envio", value: kpis.separado, accent: "amber" },
          { label: "Enviado ao Fabricante", value: kpis.enviado, accent: "green" },
          { label: "Com Prev. de Envio", value: kpis.comPrevisao, accent: "purple" },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
            {loading ? (
              <div className="skeleton h-7 w-16" />
            ) : (
              <p className={`text-2xl font-bold tracking-tight ${
                accent === "blue" ? "text-blue-500"
                : accent === "amber" ? "text-amber-500"
                : accent === "green" ? "text-emerald-500"
                : accent === "purple" ? "text-purple-500"
                : "text-slate-900"
              }`}>{value.toLocaleString("pt-BR")}</p>
            )}
          </div>
        ))}
      </div>

      {/* Active filter tags */}
      {activeSidebarFilters > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Filtros ativos:</span>
          {estoqueFilters.fabricantes.map((f) => (
            <FilterTag key={f} label={f} color="blue" />
          ))}
          {estoqueFilters.tipos.map((t) => (
            <FilterTag key={t} label={t} color="amber" />
          ))}
          {estoqueFilters.empresas.map((e) => (
            <FilterTag key={e} label={e} color="purple" />
          ))}
          {(estoqueFilters.previsaoStart || estoqueFilters.previsaoEnd) && (
            <FilterTag
              label={`Prev. ${estoqueFilters.previsaoStart ? formatDate(estoqueFilters.previsaoStart) : "..."} → ${estoqueFilters.previsaoEnd ? formatDate(estoqueFilters.previsaoEnd) : "..."}`}
              color="emerald"
            />
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <HorizontalBarChart title="Itens por Fabricante" items={fabChart} color="#3b82f6" loading={loading} />
        <HorizontalBarChart title="Itens por Tipo" items={tipoChart} color="#f59e0b" loading={loading} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        {/* Table header + filters */}
        <div className="px-5 py-4 border-b border-slate-50">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-800 mr-2">Estoque Danificado</h3>

            {/* Search */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs">
              <MagnifyingGlass size={13} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Buscar produto, SN ou SAC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <FunnelSimple size={13} className="text-slate-400" />
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    setSelectedStatus((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                    )
                  }
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    selectedStatus.includes(s)
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {STATUS_LABELS[s]}
                  {statusCounts[s] ? ` (${statusCounts[s]})` : ""}
                </button>
              ))}
            </div>

            {/* Pagination */}
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs text-slate-400 mr-2">
                {filteredData.length.toLocaleString("pt-BR")} itens
                {filteredData.length !== allData.length && ` de ${allData.length.toLocaleString("pt-BR")}`}
              </span>
              {totalPages > 1 && (
                <>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors text-slate-500"
                  >
                    <CaretLeft size={14} />
                  </button>
                  <span className="text-xs text-slate-500 px-1">{page + 1}/{totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="p-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors text-slate-500"
                  >
                    <CaretRight size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80">
                {["Produto", "Fabricante", "SN", "Tipo", "Status", "CD / Empresa", "SAC", "Prev. Envio", "NF Retorno", "Data Envio"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-3 w-full" style={{ width: `${50 + Math.random() * 50}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : pageData.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-800 font-medium max-w-xs truncate" title={r.produto ?? ""}>
                        {r.produto ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{r.fabricante ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{r.sn ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{r.tipo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`badge ${STATUS_CLASS[r.status ?? ""] ?? "bg-slate-100 text-slate-500"}`}>
                          {STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{r.cd ?? r.empresa ?? "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 text-center">{r.sac || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{formatDate(r.previsao_envio)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{r.nf_retorno || "—"}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{formatDate(r.data_envio)}</td>
                    </tr>
                  ))}
              {!loading && pageData.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <Package size={36} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-sm text-slate-400">Nenhum item encontrado</p>
                    <p className="text-xs text-slate-300 mt-1">
                      {allData.length > 0
                        ? "Tente ajustar os filtros para ver mais resultados"
                        : "Importe a planilha de Estoque Danificado para visualizar os dados"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterTag({ label, color = "blue" }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${colors[color] ?? colors.blue}`}>
      {label}
    </span>
  );
}
