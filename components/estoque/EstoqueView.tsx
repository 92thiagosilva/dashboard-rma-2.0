"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Package, MagnifyingGlass, FunnelSimple, CaretLeft, CaretRight,
} from "@phosphor-icons/react";
import { HorizontalBarChart } from "@/components/dashboard/HorizontalBar";

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
  const [data, setData] = useState<EstoqueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedFabs, setSelectedFabs] = useState<string[]>([]);
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedStatus.length) params.set("status", selectedStatus.join(","));
      if (selectedFabs.length) params.set("fabricantes", selectedFabs.join(","));
      if (selectedTipos.length) params.set("tipos", selectedTipos.join(","));
      const res = await fetch(`/api/estoque?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setPage(0);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [search, selectedStatus, selectedFabs, selectedTipos]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { fabricantes, tipos, statusCounts } = useMemo(() => {
    const fabs = new Set<string>();
    const tiposSet = new Set<string>();
    const sc: Record<string, number> = {};
    data.forEach((r) => {
      if (r.fabricante) fabs.add(r.fabricante);
      if (r.tipo) tiposSet.add(r.tipo);
      if (r.status) sc[r.status] = (sc[r.status] ?? 0) + 1;
    });
    return {
      fabricantes: [...fabs].sort(),
      tipos: [...tiposSet].sort(),
      statusCounts: sc,
    };
  }, [data]);

  const kpis = useMemo(() => ({
    total: data.length,
    recebido: statusCounts["1-RECEBIDO NO CD"] ?? 0,
    separado: statusCounts["2-SEPARADO PARA ENVIO"] ?? 0,
    enviado: statusCounts["3-ENVIADO"] ?? 0,
    comPrevisao: data.filter((r) => r.previsao_envio).length,
  }), [data, statusCounts]);

  const fabChart = useMemo(() =>
    Object.entries(
      data.reduce<Record<string, number>>((acc, r) => {
        if (r.fabricante) acc[r.fabricante] = (acc[r.fabricante] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, displayValue: value })),
  [data]);

  const tipoChart = useMemo(() =>
    Object.entries(
      data.reduce<Record<string, number>>((acc, r) => {
        if (r.tipo) acc[r.tipo] = (acc[r.tipo] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, displayValue: value })),
  [data]);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const pageData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
            <p className={`text-2xl font-bold tracking-tight ${
              accent === "blue" ? "text-blue-500"
              : accent === "amber" ? "text-amber-500"
              : accent === "green" ? "text-emerald-500"
              : accent === "purple" ? "text-purple-500"
              : "text-slate-900"
            }`}>{value.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>

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
                placeholder="Buscar produto ou SN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
              />
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

            <div className="ml-auto flex items-center gap-1">
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
              {pageData.map((r) => (
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
              {pageData.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <Package size={36} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-sm text-slate-400">Nenhum item encontrado</p>
                    <p className="text-xs text-slate-300 mt-1">Importe a planilha de Estoque Danificado para visualizar os dados</p>
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
