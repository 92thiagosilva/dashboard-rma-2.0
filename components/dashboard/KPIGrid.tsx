"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: "blue" | "red" | "amber" | "green" | "slate";
  loading?: boolean;
}

function KPICard({ label, value, sub, accent = "slate", loading }: KPICardProps) {
  const accentColors = {
    blue: "text-blue-500",
    red: "text-red-500",
    amber: "text-amber-500",
    green: "text-emerald-500",
    slate: "text-slate-900",
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
        <div className="skeleton h-3 w-24 mb-3" />
        <div className="skeleton h-7 w-16" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card transition-all hover:shadow-card-hover">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 truncate">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${accentColors[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export function KPIGrid() {
  const { rmaData, vendasData, loading } = useDashboard();

  const kpis = useMemo(() => {
    // Total de pedidos = NFs únicas (uma NF pode ter vários inversores)
    const nfSet = new Set(vendasData.map((v) => v.numero_fotus).filter(Boolean));
    const totalVendas = nfSet.size;

    // Total de inversores = soma das quantidades vendidas
    const totalInversores = vendasData.reduce((s, v) => s + (v.quantidade_vendida ?? 0), 0);

    const totalRMA = rmaData.length;

    // Taxa de falha usa inversores como denominador (unidades no campo)
    const taxa = totalInversores > 0 ? (totalRMA / totalInversores) * 100 : 0;

    const estados = new Set(rmaData.map((r) => r.estado).filter(Boolean)).size;

    let rmaDia = 0;
    let rmaMes = 0;
    if (totalRMA > 0) {
      const dates = rmaData
        .map((r) => r.data_criacao)
        .filter(Boolean)
        .map((d) => new Date(d!).getTime());
      if (dates.length > 0) {
        const minDate = dates.reduce((a, b) => Math.min(a, b));
        const maxDate = dates.reduce((a, b) => Math.max(a, b));
        const diffDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000) + 1);
        rmaDia = totalRMA / diffDays;
        rmaMes = rmaDia * 30.44;
      }
    }

    return { totalVendas, totalInversores, totalRMA, taxa, estados, rmaDia, rmaMes };
  }, [rmaData, vendasData]);

  return (
    <div className="grid grid-cols-3 gap-4 mb-5">
      <KPICard
        label="Pedidos (NFs únicas)"
        value={kpis.totalVendas.toLocaleString("pt-BR")}
        sub={`${kpis.totalInversores.toLocaleString("pt-BR")} inversores vendidos`}
        accent="blue"
        loading={loading}
      />
      <KPICard
        label="Total RMAs (filtrado)"
        value={kpis.totalRMA.toLocaleString("pt-BR")}
        accent="red"
        loading={loading}
      />
      <KPICard
        label="Taxa de Falha"
        value={`${kpis.taxa.toFixed(2)}%`}
        sub={`${kpis.totalRMA} RMAs / ${kpis.totalInversores.toLocaleString("pt-BR")} inversores`}
        accent={kpis.taxa > 5 ? "red" : kpis.taxa > 2 ? "amber" : "green"}
        loading={loading}
      />
      <KPICard
        label="Estados Afetados"
        value={String(kpis.estados)}
        loading={loading}
      />
      <KPICard
        label="RMA / Dia (média)"
        value={kpis.rmaDia.toFixed(1)}
        loading={loading}
      />
      <KPICard
        label="RMA / Mês (estimado)"
        value={Math.round(kpis.rmaMes).toLocaleString("pt-BR")}
        loading={loading}
      />
    </div>
  );
}
