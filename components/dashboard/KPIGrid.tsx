"use client";

import { useMemo, useState, useEffect } from "react";
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

interface CohortData {
  linkedRMACount: number;
  totalInversores: number;
  taxa: number;
}

export function KPIGrid() {
  const { rmaData, vendasData, loading, filters, filterOptions } = useDashboard();

  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [cohortLoading, setCohortLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      setCohortLoading(true);
      try {
        const params = new URLSearchParams({ type: "cohort" });
        if (filters.dateStart) params.set("dateStart", filters.dateStart);
        if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);

        // Só passa fabricantes/modelos quando o usuário reduziu a seleção (mesmo lógica do KPI global)
        const fabricantesFiltered =
          filterOptions.fabricantes.length > 0 &&
          filters.fabricantes.length < filterOptions.fabricantes.length;
        const modelosFiltered =
          filterOptions.modelos.length > 0 &&
          filters.modelos.length < filterOptions.modelos.length;

        if (fabricantesFiltered) params.set("fabricantes", filters.fabricantes.join(","));
        if (modelosFiltered) params.set("modelos", filters.modelos.join(","));

        const res = await fetch(`/api/analytics?${params}`);
        if (!res.ok || cancelled) return;
        const data: CohortData = await res.json();
        if (!cancelled) setCohort(data);
      } catch {
        // ignora
      } finally {
        if (!cancelled) setCohortLoading(false);
      }
    };
    fetch_();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateStart, filters.dateEnd, filters.fabricantes.join(","), filters.modelos.join(","), filterOptions.fabricantes.length, filterOptions.modelos.length]);

  const kpis = useMemo(() => {
    // vendasData já vem filtrado pelo servidor via get_vendas_filtered() quando fabricante/modelo
    // estão selecionados (migration 006). O cross-filter client-side foi removido porque usava
    // rmaData (date-filtered), excluindo produtos sem RMA no período e gerando sub-contagem.
    const filteredVendas = vendasData;

    // Total de pedidos = NFs únicas (uma NF pode ter vários inversores)
    const nfSet = new Set(filteredVendas.map((v) => v.numero_fotus).filter(Boolean));
    const totalVendas = nfSet.size;

    // Total de inversores = soma das quantidades vendidas
    const totalInversores = filteredVendas.reduce((s, v) => s + (v.quantidade_vendida ?? 0), 0);

    // Total RMAs = SACs únicos (um SAC pode ter múltiplas linhas)
    const sacSet = new Set(rmaData.map((r) => r.sac).filter(Boolean));
    const totalRMA = sacSet.size > 0 ? sacSet.size : rmaData.length;

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

  const cohortTaxa = cohort?.taxa ?? 0;
  const cohortAccent =
    cohortTaxa > 5 ? "text-red-500" : cohortTaxa > 2 ? "text-amber-500" : "text-emerald-500";

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
        label="Taxa de Falha (período)"
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

      {/* Taxa de Falha por Coorte de Venda — card full-width */}
      <div className="col-span-3 bg-white rounded-xl border border-slate-100 border-l-4 border-l-amber-400 p-5 shadow-card transition-all hover:shadow-card-hover">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">
              Taxa de Falha por Coorte de Venda
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              RMAs de qualquer época vinculados às vendas do período via Nro. Fotus —{" "}
              {filters.dateStart || filters.dateEnd
                ? `${filters.dateStart || "início"} → ${filters.dateEnd || "hoje"}`
                : "todos os períodos"}
            </p>
          </div>
          <div className="flex items-center gap-8 shrink-0">
            {cohortLoading ? (
              <>
                <div className="text-right space-y-1"><div className="skeleton h-7 w-20" /><div className="skeleton h-3 w-16" /></div>
                <div className="text-right space-y-1"><div className="skeleton h-6 w-16" /><div className="skeleton h-3 w-14" /></div>
                <div className="text-right space-y-1"><div className="skeleton h-6 w-20" /><div className="skeleton h-3 w-20" /></div>
              </>
            ) : (
              <>
                <div className="text-right">
                  <p className={`text-2xl font-bold tracking-tight ${cohortAccent}`}>
                    {cohortTaxa.toFixed(2)}%
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">taxa por coorte</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-800">
                    {(cohort?.linkedRMACount ?? 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">RMAs vinculados</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-800">
                    {(cohort?.totalInversores ?? 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">inversores no período</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
