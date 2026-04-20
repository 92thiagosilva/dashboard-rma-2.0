"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/store";
import { calcularSolarInsights } from "@/lib/analytics";
import { ArrowUp, SolarPanel, Thermometer, Warning } from "@phosphor-icons/react";

interface InsightCardProps {
  label: string;
  value: string;
  sub: string;
  color: "purple" | "red" | "amber" | "blue";
  loading?: boolean;
}

function InsightCard({ label, value, sub, color, loading }: InsightCardProps) {
  const borderColors = {
    purple: "border-l-purple-500",
    red: "border-l-red-500",
    amber: "border-l-amber-500",
    blue: "border-l-blue-500",
  };
  const labelColors = {
    purple: "text-purple-500",
    red: "text-red-500",
    amber: "text-amber-500",
    blue: "text-blue-500",
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 border-l-4 border-l-slate-200 p-4 shadow-card">
        <div className="skeleton h-2.5 w-20 mb-3" />
        <div className="skeleton h-4 w-full mb-1.5" />
        <div className="skeleton h-3 w-16" />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-100 border-l-4 ${borderColors[color]} p-4 shadow-card`}>
      <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${labelColors[color]}`}>{label}</p>
      <p className="text-sm font-semibold text-slate-800 truncate" title={value}>{value || "—"}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function InsightsGrid() {
  const { rmaData, vendasData, loading } = useDashboard();

  const insights = useMemo(() => {
    if (rmaData.length === 0) return null;

    const rmaPorModelo: Record<string, number> = {};
    const vendasPorModelo: Record<string, number> = {};
    const rmaPorDefeito: Record<string, number> = {};
    const rmaPorEstado: Record<string, number> = {};
    const vendasPorFabricante: Record<string, number> = {};

    rmaData.forEach((r) => {
      if (r.produto) rmaPorModelo[r.produto] = (rmaPorModelo[r.produto] ?? 0) + 1;
      if (r.problematica) rmaPorDefeito[r.problematica] = (rmaPorDefeito[r.problematica] ?? 0) + 1;
      if (r.estado) rmaPorEstado[r.estado] = (rmaPorEstado[r.estado] ?? 0) + 1;
    });

    vendasData.forEach((v) => {
      if (v.descricao_produto)
        vendasPorModelo[v.descricao_produto] = (vendasPorModelo[v.descricao_produto] ?? 0) + (v.quantidade_vendida ?? 0);
      // Map fabricante via RMA cross
    });

    // Map fabricante from RMA to vendas aggregation
    rmaData.forEach((r) => {
      if (r.fabricante && r.produto) {
        const vendas = vendasPorModelo[r.produto] ?? 0;
        vendasPorFabricante[r.fabricante] = (vendasPorFabricante[r.fabricante] ?? 0) + vendas;
      }
    });

    const topVolume = Object.entries(rmaPorModelo).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
    const topTaxa = Object.entries(rmaPorModelo)
      .map(([m, rma]) => {
        const v = vendasPorModelo[m] ?? 0;
        return { m, taxa: v > 0 ? (rma / v) * 100 : 0 };
      })
      .sort((a, b) => b.taxa - a.taxa)[0] ?? { m: "—", taxa: 0 };
    const topDefeito = Object.entries(rmaPorDefeito).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
    const topEstado = Object.entries(rmaPorEstado).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];

    const solar = calcularSolarInsights(rmaData, vendasPorFabricante);

    return { topVolume, topTaxa, topDefeito, topEstado, solar };
  }, [rmaData, vendasData]);

  return (
    <div className="mb-5 space-y-3">
      {/* Main insights */}
      <div className="grid grid-cols-4 gap-3">
        <InsightCard
          label="Maior Volume"
          value={insights?.topVolume[0] ?? "—"}
          sub={insights ? `${insights.topVolume[1]} RMAs` : ""}
          color="purple"
          loading={loading}
        />
        <InsightCard
          label="Maior Taxa de Falha"
          value={insights?.topTaxa.m ?? "—"}
          sub={insights ? `${insights.topTaxa.taxa.toFixed(2)}%` : ""}
          color="red"
          loading={loading}
        />
        <InsightCard
          label="Defeito Mais Comum"
          value={insights?.topDefeito[0] ?? "—"}
          sub={insights ? `${insights.topDefeito[1]} ocorrências` : ""}
          color="amber"
          loading={loading}
        />
        <InsightCard
          label="Estado com Mais RMAs"
          value={insights?.topEstado[0] ?? "—"}
          sub={insights ? `${insights.topEstado[1]} casos` : ""}
          color="blue"
          loading={loading}
        />
      </div>

      {/* Solar FV Insights panel */}
      {insights?.solar && !loading && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <SolarPanel size={14} weight="duotone" className="text-amber-500" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Insights Solar FV</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Fabricantes em alerta */}
            <div className="p-3 bg-red-50 rounded-lg border border-red-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Warning size={11} weight="fill" className="text-red-500" />
                <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Alerta de Falha &gt;5%</span>
              </div>
              {insights.solar.fabricantesAlerta.length > 0 ? (
                insights.solar.fabricantesAlerta.slice(0, 2).map((f) => (
                  <p key={f.fabricante} className="text-xs font-semibold text-red-700 truncate">
                    {f.fabricante} — {f.taxa.toFixed(1)}%
                  </p>
                ))
              ) : (
                <p className="text-xs text-emerald-600 font-medium">Nenhum fabricante em alerta</p>
              )}
            </div>

            {/* Classificação breakdown */}
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Thermometer size={11} weight="fill" className="text-blue-500" />
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Por Classificação</span>
              </div>
              {insights.solar.classificacaoBreakdown.slice(0, 2).map((c) => (
                <p key={c.classificacao} className="text-xs text-blue-700 truncate">
                  {c.classificacao}: <strong>{c.pct}%</strong>
                </p>
              ))}
            </div>

            {/* Melhor MTTF */}
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUp size={11} weight="bold" className="text-emerald-500" />
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Maior MTTF</span>
              </div>
              {insights.solar.melhorMTTF ? (
                <>
                  <p className="text-xs font-semibold text-emerald-700 truncate">{insights.solar.melhorMTTF.produto}</p>
                  <p className="text-[10px] text-emerald-600">{insights.solar.melhorMTTF.mttf.toLocaleString("pt-BR")} dias</p>
                </>
              ) : <p className="text-xs text-slate-400">Sem dados</p>}
            </div>

            {/* Mês com mais RMA */}
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Warning size={11} weight="fill" className="text-amber-500" />
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Pico de RMAs</span>
              </div>
              {insights.solar.mesComMaisRMA ? (
                <>
                  <p className="text-xs font-semibold text-amber-700">{insights.solar.mesComMaisRMA.mes}</p>
                  <p className="text-[10px] text-amber-600">{insights.solar.mesComMaisRMA.total} RMAs</p>
                </>
              ) : <p className="text-xs text-slate-400">Sem dados</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
