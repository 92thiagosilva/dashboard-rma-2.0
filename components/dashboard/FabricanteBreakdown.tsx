"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/lib/store";
import { criaResolverPotencia, normalizaKW, formataValor } from "@/lib/units";

interface CohortByFab {
  linked: number;
  inv: number;
  linkedKw?: number;
  invKw?: number;
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
  const { rmaData, filters, unidade, powerMap } = useDashboard();
  const [cohortData, setCohortData] = useState<Record<string, CohortByFab>>({});
  const [loading, setLoading] = useState(false);

  const selectedFabs = filters.fabricantes;
  const selectedKey = selectedFabs.join(",");

  // Taxa Global: RMAs do período (SAC único) por fabricante — a partir do rmaData
  // já filtrado. Calcula contagem e kW (soma da potência, 1 valor por SAC).
  const globalRmaByFab = useMemo(() => {
    const resolver = criaResolverPotencia(powerMap);
    const rmaKW = (r: typeof rmaData[number]) => normalizaKW(r.potencia) ?? resolver(r.produto) ?? 0;
    const rows: Record<string, Map<string, typeof rmaData[number]>> = {};
    for (const r of rmaData) {
      if (!r.fabricante) continue;
      const m = (rows[r.fabricante] ??= new Map());
      const k = r.sac ?? `__id_${r.id}`;
      if (!m.has(k)) m.set(k, r);
    }
    const count: Record<string, number> = {};
    const kw: Record<string, number> = {};
    for (const fab in rows) {
      count[fab] = rows[fab].size;
      let sum = 0;
      for (const r of rows[fab].values()) sum += rmaKW(r);
      kw[fab] = sum;
    }
    return { count, kw };
  }, [rmaData, powerMap]);

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
            return [fab, { linked: d.linkedRMACount ?? 0, inv: d.totalInversores ?? 0, linkedKw: d.linkedRMAKw, invKw: d.totalInversoresKw }];
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

  // Só exibe em kW quando a migration 008 já forneceu os campos kW
  const kwDisponivel = Object.values(cohortData).some((c) => c.invKw != null);
  const emKW = unidade === "kw" && kwDisponivel;

  const rows: FabRow[] = useMemo(() => {
    return selectedFabs
      .map((fab) => {
        const c = cohortData[fab] ?? { linked: 0, inv: 0 };
        const globalRma = emKW ? (globalRmaByFab.kw[fab] ?? 0) : (globalRmaByFab.count[fab] ?? 0);
        const cohortRma = emKW ? (c.linkedKw ?? 0) : c.linked;
        const inversores = emKW ? (c.invKw ?? 0) : c.inv;
        return {
          fabricante: fab,
          globalRma,
          cohortRma,
          inversores,
          taxaGlobal: inversores > 0 ? (globalRma / inversores) * 100 : 0,
          taxaCoorte: inversores > 0 ? (cohortRma / inversores) * 100 : 0,
        };
      })
      .sort((a, b) => b.inversores - a.inversores);
  }, [selectedFabs, globalRmaByFab, cohortData, emKW]);

  if (selectedFabs.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-100 border-l-4 border-l-indigo-400 shadow-card mb-5 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
          Taxas por Fabricante Selecionado
          {unidade === "kw" && !kwDisponivel && <span className="ml-1.5 text-slate-300 normal-case tracking-normal">(em inversores)</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="text-left font-bold px-4 py-1.5">Fabricante</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Global</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Corte</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW Vendido" : "Qtd. Vendido"}</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW RMA (Global)" : "Qtd. RMA (Global)"}</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW RMA (Corte)" : "Qtd. RMA (Corte)"}</th>
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
                <td className="px-4 py-1 text-right text-slate-400">{emKW ? formataValor(r.inversores, unidade) : r.inversores.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-1 text-right text-slate-400">{emKW ? formataValor(r.globalRma, unidade) : r.globalRma.toLocaleString("pt-BR")}</td>
                <td className="px-4 py-1 text-right text-slate-400">{emKW ? formataValor(r.cohortRma, unidade) : r.cohortRma.toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
