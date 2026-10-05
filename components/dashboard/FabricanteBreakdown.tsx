"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/lib/store";

interface CohortByFab {
  linked: number;
  inv: number;
}

interface FabRow {
  fabricante: string;
  globalRma: number;
  cohortRma: number;
  inversores: number;
  taxaGlobal: number;
  taxaCoorte: number;
}

function taxaColor(t: number) {
  return t > 5 ? "text-red-500" : t > 2 ? "text-amber-500" : "text-emerald-500";
}

export function FabricanteBreakdown() {
  const { rmaData, filters } = useDashboard();
  const [cohortData, setCohortData] = useState<Record<string, CohortByFab>>({});
  const [loading, setLoading] = useState(false);

  const selectedFabs = filters.fabricantes;
  const selectedKey = selectedFabs.join(",");

  // Taxa Global: RMAs do período (SAC único) por fabricante — a partir do rmaData
  // já filtrado (mesmo escopo do KPI "Taxa de Falha (período)").
  const globalRmaByFab = useMemo(() => {
    const sets: Record<string, Set<string>> = {};
    for (const r of rmaData) {
      if (!r.fabricante) continue;
      (sets[r.fabricante] ??= new Set()).add(r.sac ?? `__id_${r.id}`);
    }
    const out: Record<string, number> = {};
    for (const k in sets) out[k] = sets[k].size;
    return out;
  }, [rmaData]);

  // Taxa por Coorte + inversores no período: via RPC cohort, uma chamada por
  // fabricante selecionado (reaproveita a função existente no banco).
  useEffect(() => {
    if (selectedFabs.length === 0) {
      setCohortData({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const entries = await Promise.all(
        selectedFabs.map(async (fab): Promise<[string, CohortByFab]> => {
          try {
            const params = new URLSearchParams({ type: "cohort", fabricantes: fab });
            if (filters.dateStart) params.set("dateStart", filters.dateStart);
            if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
            if (filters.apenasAtivos) params.set("apenasAtivos", "1");
            const res = await fetch(`/api/analytics?${params}`);
            if (!res.ok) return [fab, { linked: 0, inv: 0 }];
            const d = await res.json();
            return [fab, { linked: d.linkedRMACount ?? 0, inv: d.totalInversores ?? 0 }];
          } catch {
            return [fab, { linked: 0, inv: 0 }];
          }
        })
      );
      if (cancelled) return;
      setCohortData(Object.fromEntries(entries));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, filters.dateStart, filters.dateEnd, filters.apenasAtivos]);

  const rows: FabRow[] = useMemo(() => {
    return selectedFabs
      .map((fab) => {
        const globalRma = globalRmaByFab[fab] ?? 0;
        const c = cohortData[fab] ?? { linked: 0, inv: 0 };
        return {
          fabricante: fab,
          globalRma,
          cohortRma: c.linked,
          inversores: c.inv,
          taxaGlobal: c.inv > 0 ? (globalRma / c.inv) * 100 : 0,
          taxaCoorte: c.inv > 0 ? (c.linked / c.inv) * 100 : 0,
        };
      })
      .sort((a, b) => b.inversores - a.inversores);
  }, [selectedFabs, globalRmaByFab, cohortData]);

  if (selectedFabs.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 border-l-4 border-l-indigo-400 shadow-card mb-5 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
          Taxas por Fabricante Selecionado
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="text-left font-bold px-4 py-1.5">Fabricante</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Global</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Coorte</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">RMA per.</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">RMA vinc.</th>
              <th className="text-right font-bold px-4 py-1.5">Inversores</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fabricante} className="border-t border-slate-50 hover:bg-slate-50/60 transition-colors">
                <td className="px-4 py-1 font-medium text-slate-700 truncate max-w-[200px]" title={r.fabricante}>
                  {r.fabricante}
                </td>
                <td className={`px-4 py-1 text-right font-bold ${taxaColor(r.taxaGlobal)}`}>
                  {loading && !cohortData[r.fabricante] ? "…" : `${r.taxaGlobal.toFixed(2)}%`}
                </td>
                <td className={`px-4 py-1 text-right font-bold ${taxaColor(r.taxaCoorte)}`}>
                  {loading && !cohortData[r.fabricante] ? "…" : `${r.taxaCoorte.toFixed(2)}%`}
                </td>
                <td className="px-4 py-1 text-right text-slate-400">{r.globalRma.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-1 text-right text-slate-400">{r.cohortRma.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-1 text-right text-slate-400">{r.inversores.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
