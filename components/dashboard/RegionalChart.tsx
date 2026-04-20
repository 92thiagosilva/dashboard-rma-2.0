"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { HorizontalBarChart } from "./HorizontalBar";

export function RegionalChart() {
  const { rmaData, loading, setCrossFilter } = useDashboard();

  const items = useMemo(() => {
    const counts: Record<string, number> = {};
    rmaData.forEach((r) => {
      if (r.estado) counts[r.estado] = (counts[r.estado] ?? 0) + 1;
    });
    const total = rmaData.length;

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([estado, count]) => ({
        label: estado,
        value: count,
        displayValue: (
          <span>
            {count}
            <span className="font-normal text-slate-400 ml-1">
              ({total > 0 ? ((count / total) * 100).toFixed(1) : 0}%)
            </span>
          </span>
        ),
        onClick: () => setCrossFilter("estado", estado),
      }));
  }, [rmaData, setCrossFilter]);

  return (
    <HorizontalBarChart
      title="Distribuição Regional (RMAs por Estado)"
      items={items}
      color="#8b5cf6"
      loading={loading}
    />
  );
}
