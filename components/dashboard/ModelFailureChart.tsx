"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { HorizontalBarChart } from "./HorizontalBar";

export function ModelFailureChart() {
  const { rmaData, vendasData, loading, setCrossFilter } = useDashboard();

  const items = useMemo(() => {
    const rmaPorModelo: Record<string, { rma: number; fab: string }> = {};
    const vendasPorModelo: Record<string, number> = {};

    rmaData.forEach((r) => {
      if (!r.produto) return;
      if (!rmaPorModelo[r.produto]) rmaPorModelo[r.produto] = { rma: 0, fab: r.fabricante ?? "" };
      rmaPorModelo[r.produto].rma += 1;
    });
    vendasData.forEach((v) => {
      if (!v.descricao_produto) return;
      vendasPorModelo[v.descricao_produto] = (vendasPorModelo[v.descricao_produto] ?? 0) + (v.quantidade_vendida ?? 0);
    });

    return Object.entries(rmaPorModelo)
      .map(([produto, { rma, fab }]) => {
        const vendas = vendasPorModelo[produto] ?? 0;
        const taxa = vendas > 0 ? (rma / vendas) * 100 : 0;
        return { produto, fab, rma, vendas, taxa };
      })
      .sort((a, b) => b.taxa - a.taxa)
      .slice(0, 10)
      .map((m) => ({
        label: m.produto,
        value: m.taxa,
        displayValue: (
          <span>
            {m.taxa.toFixed(2)}%
            <span className="font-normal text-slate-400 ml-1">
              ({m.rma} / {m.vendas})
            </span>
          </span>
        ),
        onClick: () => setCrossFilter("produto", m.produto),
      }));
  }, [rmaData, vendasData, setCrossFilter]);

  return (
    <HorizontalBarChart
      title="Taxa de Falha por Modelo (Top 10)"
      items={items}
      color="#ef4444"
      loading={loading}
    />
  );
}
