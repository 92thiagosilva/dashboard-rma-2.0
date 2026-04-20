"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { HorizontalBarChart } from "./HorizontalBar";

export function DefectsChart() {
  const { rmaData, loading, setCrossFilter } = useDashboard();

  const items = useMemo(() => {
    const counts: Record<string, number> = {};
    rmaData.forEach((r) => {
      if (r.problematica) counts[r.problematica] = (counts[r.problematica] ?? 0) + 1;
    });
    const total = rmaData.length;

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([defeito, count]) => ({
        label: defeito,
        value: count,
        displayValue: (
          <span>
            {count}
            <span className="font-normal text-slate-400 ml-1">
              ({total > 0 ? ((count / total) * 100).toFixed(1) : 0}%)
            </span>
          </span>
        ),
        onClick: () => setCrossFilter("problematica", defeito),
      }));
  }, [rmaData, setCrossFilter]);

  return (
    <HorizontalBarChart
      title="Top 10 Defeitos Recorrentes"
      items={items}
      color="#f59e0b"
      loading={loading}
    />
  );
}
