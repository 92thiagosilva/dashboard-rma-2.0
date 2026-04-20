"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { useDashboard } from "@/lib/store";

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
  const { rmaData, vendasData, loading } = useDashboard();

  const data = useMemo(() => {
    const timeline: Record<string, { mes: string; vendas: number; rma: number }> = {};

    let minRmaMes: string | null = null;
    rmaData.forEach((r) => {
      if (!r.data_criacao) return;
      const mes = r.data_criacao.slice(0, 7);
      if (!minRmaMes || mes < minRmaMes) minRmaMes = mes;
      if (!timeline[mes]) timeline[mes] = { mes, vendas: 0, rma: 0 };
      timeline[mes].rma += 1;
    });

    vendasData.forEach((v) => {
      if (!v.data_venda) return;
      const mes = v.data_venda.slice(0, 7);
      if (minRmaMes && mes < minRmaMes) return;
      if (!timeline[mes]) timeline[mes] = { mes, vendas: 0, rma: 0 };
      timeline[mes].vendas += v.quantidade_vendida ?? 0;
    });

    return Object.values(timeline)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((d) => ({ ...d, label: formatMonthLabel(d.mes) }));
  }, [rmaData, vendasData]);

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
            name="Volume de Vendas"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="rma"
            type="monotone"
            dataKey="rma"
            name="RMAs Abertos"
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
