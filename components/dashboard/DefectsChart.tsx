"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { HorizontalBarChart } from "./HorizontalBar";
import { criaResolverPotencia, normalizaKW, formataValor } from "@/lib/units";

export function DefectsChart() {
  const { rmaData, loading, setCrossFilter, unidade, powerMap } = useDashboard();

  const items = useMemo(() => {
    const resolver = criaResolverPotencia(powerMap);
    const peso = (r: typeof rmaData[number]) =>
      unidade === "kw" ? (normalizaKW(r.potencia) ?? resolver(r.produto) ?? 0) : 1;

    const counts: Record<string, number> = {};
    let total = 0;
    rmaData.forEach((r) => {
      const w = peso(r);
      total += w;
      if (r.problematica) counts[r.problematica] = (counts[r.problematica] ?? 0) + w;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([defeito, value]) => ({
        label: defeito,
        value,
        displayValue: (
          <span>
            {unidade === "kw" ? formataValor(value, unidade) : value}
            <span className="font-normal text-slate-400 ml-1">
              ({total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)
            </span>
          </span>
        ),
        onClick: () => setCrossFilter("problematica", defeito),
      }));
  }, [rmaData, setCrossFilter, unidade, powerMap]);

  return (
    <HorizontalBarChart
      title="Top 10 Defeitos Recorrentes"
      items={items}
      color="#f59e0b"
      loading={loading}
    />
  );
}
