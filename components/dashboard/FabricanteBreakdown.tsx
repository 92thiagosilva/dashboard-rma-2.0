"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { criaResolverPotencia, normalizaKW, formataValor, normProd } from "@/lib/units";

interface FabRow {
  fabricante: string;
  vendido: number;
  rmaGlobal: number;
  rmaCorte: number;
  taxaGlobal: number;
  taxaCorte: number;
}

function taxaColor(t: number) {
  return t > 5 ? "text-red-500" : t > 2 ? "text-amber-500" : "text-emerald-500";
}

export function FabricanteBreakdown() {
  const { rmaData, vendasData, cohortBase, filters, unidade, powerMap } = useDashboard();
  const emKW = unidade === "kw";
  const selectedFabs = filters.fabricantes;

  // Tudo calculado no cliente: inversores (vendasData do período), RMA global
  // (rmaData do período, dedup por SAC) e RMA por coorte (cohortBase = todos os
  // RMAs vinculados às vendas do período via nro_fotus). count + kW.
  const rows: FabRow[] = useMemo(() => {
    const resolver = criaResolverPotencia(powerMap);
    const rmaKW = (potencia: number | null, produto: string | null) =>
      normalizaKW(potencia) ?? resolver(produto) ?? 0;

    // produto(normalizado) -> fabricante (mais frequente), p/ mapear vendas -> fabricante
    const prodFabCount: Record<string, Record<string, number>> = {};
    for (const r of cohortBase) {
      if (!r.produto || !r.fabricante) continue;
      const k = normProd(r.produto);
      (prodFabCount[k] ??= {})[r.fabricante] = (prodFabCount[k]?.[r.fabricante] ?? 0) + 1;
    }
    const prodFab: Record<string, string> = {};
    for (const k in prodFabCount) {
      let best = ""; let bestN = -1;
      for (const f in prodFabCount[k]) if (prodFabCount[k][f] > bestN) { bestN = prodFabCount[k][f]; best = f; }
      prodFab[k] = best;
    }

    // Inversores vendidos (período) por fabricante + conjunto de nro_fotus
    const invCount: Record<string, number> = {};
    const invKw: Record<string, number> = {};
    const fotusByFab: Record<string, Set<string>> = {};
    for (const v of vendasData) {
      const fab = prodFab[normProd(v.descricao_produto)];
      if (!fab) continue;
      const q = v.quantidade_vendida ?? 0;
      invCount[fab] = (invCount[fab] ?? 0) + q;
      invKw[fab] = (invKw[fab] ?? 0) + q * (resolver(v.descricao_produto) ?? 0);
      if (v.numero_fotus) (fotusByFab[fab] ??= new Set()).add(v.numero_fotus);
    }

    // RMA Global (período) por fabricante, dedup por SAC
    const globalSac: Record<string, Map<string, { potencia: number | null; produto: string | null }>> = {};
    for (const r of rmaData) {
      if (!r.fabricante) continue;
      const m = (globalSac[r.fabricante] ??= new Map());
      const key = r.sac ?? `__id_${r.id}`;
      if (!m.has(key)) m.set(key, { potencia: r.potencia, produto: r.produto });
    }

    // RMA Corte (qualquer data) por fabricante: nro_fotus nas vendas do período daquele fabricante
    const corteSac: Record<string, Map<string, { potencia: number | null; produto: string | null }>> = {};
    for (const r of cohortBase) {
      if (!r.fabricante || !r.nro_fotus) continue;
      const set = fotusByFab[r.fabricante];
      if (!set || !set.has(r.nro_fotus)) continue;
      const m = (corteSac[r.fabricante] ??= new Map());
      const key = r.sac ?? `__id_${r.id}`;
      if (!m.has(key)) m.set(key, { potencia: r.potencia, produto: r.produto });
    }

    const sacCount = (m?: Map<string, unknown>) => m?.size ?? 0;
    const sacKw = (m?: Map<string, { potencia: number | null; produto: string | null }>) => {
      let kw = 0;
      if (m) for (const r of m.values()) kw += rmaKW(r.potencia, r.produto);
      return kw;
    };

    return selectedFabs
      .map((fab) => {
        const vendido = emKW ? (invKw[fab] ?? 0) : (invCount[fab] ?? 0);
        const rmaGlobal = emKW ? sacKw(globalSac[fab]) : sacCount(globalSac[fab]);
        const rmaCorte = emKW ? sacKw(corteSac[fab]) : sacCount(corteSac[fab]);
        return {
          fabricante: fab,
          vendido,
          rmaGlobal,
          rmaCorte,
          taxaGlobal: vendido > 0 ? (rmaGlobal / vendido) * 100 : 0,
          taxaCorte: vendido > 0 ? (rmaCorte / vendido) * 100 : 0,
        };
      })
      .sort((a, b) => b.vendido - a.vendido);
  }, [selectedFabs, rmaData, vendasData, cohortBase, powerMap, emKW]);

  if (selectedFabs.length === 0) return null;

  const fmt = (v: number) => (emKW ? formataValor(v, unidade) : v.toLocaleString("pt-BR"));

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
                <td className={`px-4 py-1 text-right font-bold ${taxaColor(r.taxaGlobal)}`}>{r.taxaGlobal.toFixed(2)}%</td>
                <td className={`px-4 py-1 text-right font-bold ${taxaColor(r.taxaCorte)}`}>{r.taxaCorte.toFixed(2)}%</td>
                <td className="px-4 py-1 text-right text-slate-400">{fmt(r.vendido)}</td>
                <td className="px-4 py-1 text-right text-slate-400">{fmt(r.rmaGlobal)}</td>
                <td className="px-4 py-1 text-right text-slate-400">{fmt(r.rmaCorte)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
