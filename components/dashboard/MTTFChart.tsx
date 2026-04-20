"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { HorizontalBarChart } from "./HorizontalBar";

export function MTTFChart() {
  const { rmaData, loading, setCrossFilter } = useDashboard();

  const items = useMemo(() => {
    const mttfByModel: Record<string, { total: number; count: number }> = {};

    rmaData.forEach((r) => {
      if (r.produto && r.mttf_dias && r.mttf_dias > 0 && r.mttf_dias < 36500) {
        if (!mttfByModel[r.produto]) mttfByModel[r.produto] = { total: 0, count: 0 };
        mttfByModel[r.produto].total += r.mttf_dias;
        mttfByModel[r.produto].count += 1;
      }
    });

    return Object.entries(mttfByModel)
      .map(([produto, { total, count }]) => ({
        label: produto,
        value: Math.round(total / count),
        displayValue: (
          <span>
            {Math.round(total / count).toLocaleString("pt-BR")}
            <span className="font-normal text-slate-400 ml-1">dias</span>
          </span>
        ),
        onClick: () => setCrossFilter("produto", produto),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [rmaData, setCrossFilter]);

  return (
    <HorizontalBarChart
      title="Média MTTF por Modelo (Dias até Falha)"
      items={items}
      color="#10b981"
      loading={loading}
    />
  );
}
