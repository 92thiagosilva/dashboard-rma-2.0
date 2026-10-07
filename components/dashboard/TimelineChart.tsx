"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { useDashboard } from "@/lib/store";
import { criaResolverPotencia, normalizaKW, valorNaUnidade } from "@/lib/units";

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl">
      <p className="text-xs text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
};

export function TimelineChart() {
  const { rmaData, vendasData, vendasMensal, loading, unidade, powerMap } = useDashboard();

  const data = useMemo(() => {
    const filteredVendas = vendasData;
    const resolver = criaResolverPotencia(powerMap);
    const rmaKW = (r: typeof rmaData[number]) => normalizaKW(r.potencia) ?? resolver(r.produto) ?? 0;

    // Por mês: valor de vendas na unidade e RMAs dedup por SAC (1 linha por SAC)
    const timeline: Record<string, { mes: string; vendas: number; sacRows: Map<string, typeof rmaData[number]> }> = {};

    let minRmaMes: string | null = null;
    rmaData.forEach((r) => {
      if (!r.data_criacao) return;
      const mes = r.data_criacao.slice(0, 7);
      if (!minRmaMes || mes < minRmaMes) minRmaMes = mes;
      if (!timeline[mes]) timeline[mes] = { mes, vendas: 0, sacRows: new Map() };
      const k = r.sac ?? `__id_${r.id}`;
      if (!timeline[mes].sacRows.has(k)) timeline[mes].sacRows.set(k, r);
    });

    // Com vendas truncadas no cliente (120k linhas), usa a série mensal agregada no servidor
    const linhasVendas: Array<{ mes: string; qtd: number; produto: string | null }> = vendasMensal
      ? vendasMensal.map((v) => ({ mes: v.mes, qtd: v.qtd, produto: v.produto }))
      : filteredVendas.flatMap((v) =>
          v.data_venda
            ? [{ mes: v.data_venda.slice(0, 7), qtd: v.quantidade_vendida ?? 0, produto: v.descricao_produto }]
            : []
        );
    linhasVendas.forEach((v) => {
      if (minRmaMes && v.mes < minRmaMes) return;
      if (!timeline[v.mes]) timeline[v.mes] = { mes: v.mes, vendas: 0, sacRows: new Map() };
      timeline[v.mes].vendas += valorNaUnidade(v.qtd, v.produto, unidade, resolver);
    });

    return Object.values(timeline)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((d) => {
        let rma = 0;
        if (unidade === "kw") {
          for (const r of d.sacRows.values()) rma += rmaKW(r);
        } else {
          rma = d.sacRows.size;
        }
        return { mes: d.mes, vendas: Math.round(d.vendas), rma: Math.round(rma), label: formatMonthLabel(d.mes) };
      });
  }, [rmaData, vendasData, vendasMensal, unidade, powerMap]);

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 col-span-2 h-72 skeleton" />;
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 col-span-2 flex items-center justify-center h-72 text-slate-400 text-sm">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 col-span-2">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Evolução Mensal: Vendas vs RMAs</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="vendas"
            orientation="left"
            tick={{ fontSize: 10, fill: "#3b82f6" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v.toLocaleString("pt-BR")}
          />
          <YAxis
            yAxisId="rma"
            orientation="right"
            tick={{ fontSize: 10, fill: "#ef4444" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
            formatter={(value) => <span style={{ color: "#64748b" }}>{value}</span>}
          />
          <Line
            yAxisId="vendas"
            type="monotone"
            dataKey="vendas"
            name={unidade === "kw" ? "Vendas (kW)" : "Volume de Vendas"}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="rma"
            type="monotone"
            dataKey="rma"
            name={unidade === "kw" ? "RMA (kW)" : "RMAs Abertos"}
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
