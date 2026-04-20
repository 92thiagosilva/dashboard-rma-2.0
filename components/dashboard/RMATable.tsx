"use client";

import { useState, useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

const PAGE_SIZE = 50;

function formatDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function RMATable() {
  const { rmaData, loading, setCrossFilter, crossFilter, clearCrossFilter } = useDashboard();
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!crossFilter.type || !crossFilter.value) return rmaData;
    return rmaData.filter((r) => {
      if (crossFilter.type === "produto") return r.produto === crossFilter.value;
      if (crossFilter.type === "estado") return r.estado === crossFilter.value;
      if (crossFilter.type === "problematica") return r.problematica === crossFilter.value;
      return true;
    });
  }, [rmaData, crossFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <div className="p-5 border-b border-slate-50">
          <div className="skeleton h-4 w-40" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-8 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Detalhamento de RMAs</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {filtered.length.toLocaleString("pt-BR")} registros
            {crossFilter.type && (
              <> — Filtro: <strong className="text-blue-600">{crossFilter.value}</strong>
                <button onClick={clearCrossFilter} className="ml-2 text-blue-500 hover:text-blue-700">✕</button>
              </>
            )}
          </p>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors text-slate-500"
            >
              <CaretLeft size={14} />
            </button>
            <span className="text-xs text-slate-500 px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-30 transition-colors text-slate-500"
            >
              <CaretRight size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/80">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Data</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Produto / Modelo</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fabricante</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Defeito</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Classificação</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">MTTF (dias)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageData.map((r) => (
              <tr
                key={r.id}
                onClick={() => setCrossFilter("produto", r.produto ?? "")}
                className="hover:bg-slate-50/80 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                  {formatDate(r.data_criacao)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-800 font-medium max-w-xs truncate" title={r.produto ?? ""}>
                  {r.produto ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{r.fabricante ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={r.problematica ?? ""}>
                  {r.problematica ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[10px] uppercase tracking-wide">
                    {r.estado ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {r.classificacao ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-center">
                  {r.mttf_dias ? (
                    <span className={`font-bold ${r.mttf_dias < 365 ? "text-red-500" : r.mttf_dias < 730 ? "text-amber-500" : "text-emerald-600"}`}>
                      {r.mttf_dias.toLocaleString("pt-BR")}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                  Nenhum registro encontrado com os filtros aplicados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
