"use client";

import { useMemo, useState, useEffect } from "react";
import { useDashboard } from "@/lib/store";
import { criaResolverPotencia, normalizaKW, valorNaUnidade, formataValor } from "@/lib/units";

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
  linkedRMAKw?: number;
  totalInversoresKw?: number;
  taxaKw?: number;
}

export function KPIGrid() {
  const { rmaData, vendasData, loading, filters, filterOptions, unidade, powerMap } = useDashboard();
  const emKW = unidade === "kw";

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
        if (filters.apenasAtivos) params.set("apenasAtivos", "1");

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
  }, [filters.dateStart, filters.dateEnd, filters.apenasAtivos, filters.fabricantes.join(","), filters.modelos.join(","), filterOptions.fabricantes.length, filterOptions.modelos.length]);

  const kpis = useMemo(() => {
    const filteredVendas = vendasData;
    const resolver = criaResolverPotencia(powerMap);
    // kW de um RMA: usa rma.potencia; senão resolve pelo produto (mapa/nome)
    const rmaKW = (r: typeof rmaData[number]) =>
      normalizaKW(r.potencia) ?? resolver(r.produto) ?? 0;

    // Total de pedidos = NFs únicas (sempre contagem — não se aplica a kW)
    const nfSet = new Set(filteredVendas.map((v) => v.numero_fotus).filter(Boolean));
    const totalVendas = nfSet.size;

    // Vendas: contagem de inversores e valor na unidade escolhida
    let totalInversores = 0;
    let vendasValor = 0;
    for (const v of filteredVendas) {
      const q = v.quantidade_vendida ?? 0;
      totalInversores += q;
      vendasValor += valorNaUnidade(q, v.descricao_produto, unidade, resolver);
    }

    // RMAs únicos por SAC (um SAC pode ter várias linhas) — guarda 1 linha por SAC
    const sacMap = new Map<string, typeof rmaData[number]>();
    for (const r of rmaData) {
      const k = r.sac ?? `__id_${r.id}`;
      if (!sacMap.has(k)) sacMap.set(k, r);
    }
    const totalRMACount = sacMap.size;
    let rmaValor = 0;
    if (unidade === "kw") {
      for (const r of sacMap.values()) rmaValor += rmaKW(r);
    } else {
      rmaValor = totalRMACount;
    }

    // Taxa de falha: numerador e denominador na mesma unidade
    const taxa = vendasValor > 0 ? (rmaValor / vendasValor) * 100 : 0;

    const estados = new Set(rmaData.map((r) => r.estado).filter(Boolean)).size;

    let rmaDia = 0;
    let rmaMes = 0;
    if (rmaValor > 0) {
      const dates = rmaData
        .map((r) => r.data_criacao)
        .filter(Boolean)
        .map((d) => new Date(d!).getTime());
      if (dates.length > 0) {
        const minDate = dates.reduce((a, b) => Math.min(a, b));
        const maxDate = dates.reduce((a, b) => Math.max(a, b));
        const diffDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000) + 1);
        rmaDia = rmaValor / diffDays;
        rmaMes = rmaDia * 30.44;
      }
    }

    return { totalVendas, totalInversores, totalRMACount, vendasValor, rmaValor, taxa, estados, rmaDia, rmaMes };
  }, [rmaData, vendasData, unidade, powerMap]);

  // Em kW só usamos os valores kW se a migration 008 já tiver sido aplicada (campos presentes)
  const cohortTemKw = cohort?.totalInversoresKw != null;
  const cohortEmKw = emKW && cohortTemKw;
  const cohortTaxa = (cohortEmKw ? cohort?.taxaKw : cohort?.taxa) ?? 0;
  const cohortAccent =
    cohortTaxa > 5 ? "text-red-500" : cohortTaxa > 2 ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="grid grid-cols-3 gap-4 mb-5">
      <KPICard
        label="Pedidos (NFs únicas)"
        value={kpis.totalVendas.toLocaleString("pt-BR")}
        sub={emKW
          ? `${formataValor(kpis.vendasValor, unidade)} vendidos`
          : `${kpis.totalInversores.toLocaleString("pt-BR")} inversores vendidos`}
        accent="blue"
        loading={loading}
      />
      <KPICard
        label={emKW ? "Total RMAs (kW)" : "Total RMAs (filtrado)"}
        value={emKW ? formataValor(kpis.rmaValor, unidade) : kpis.totalRMACount.toLocaleString("pt-BR")}
        sub={emKW ? `${kpis.totalRMACount.toLocaleString("pt-BR")} RMAs` : undefined}
        accent="red"
        loading={loading}
      />
      <KPICard
        label="Taxa de Falha (período)"
        value={`${kpis.taxa.toFixed(2)}%`}
        sub={emKW
          ? `${formataValor(kpis.rmaValor, unidade)} / ${formataValor(kpis.vendasValor, unidade)}`
          : `${kpis.totalRMACount} RMAs / ${kpis.totalInversores.toLocaleString("pt-BR")} inversores`}
        accent={kpis.taxa > 5 ? "red" : kpis.taxa > 2 ? "amber" : "green"}
        loading={loading}
      />
      <KPICard
        label="Estados Afetados"
        value={String(kpis.estados)}
        loading={loading}
      />
      <KPICard
        label={emKW ? "kW em RMA / Dia" : "RMA / Dia (média)"}
        value={emKW ? formataValor(kpis.rmaDia, unidade) : kpis.rmaDia.toFixed(1)}
        loading={loading}
      />
      <KPICard
        label={emKW ? "kW em RMA / Mês" : "RMA / Mês (estimado)"}
        value={emKW ? formataValor(kpis.rmaMes, unidade) : Math.round(kpis.rmaMes).toLocaleString("pt-BR")}
        loading={loading}
      />

      {/* Taxa de Falha por Coorte de Venda — card full-width */}
      <div className="col-span-3 bg-white rounded-xl border border-slate-100 border-l-4 border-l-amber-400 p-5 shadow-card transition-all hover:shadow-card-hover">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">
              Taxa de Falha por Coorte de Venda
              {emKW && !cohortTemKw && <span className="ml-1.5 text-slate-300 normal-case tracking-normal">(em inversores)</span>}
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
                    {cohortEmKw
                      ? formataValor(cohort?.linkedRMAKw ?? 0, unidade)
                      : (cohort?.linkedRMACount ?? 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{cohortEmKw ? "kW vinculado" : "RMAs vinculados"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-800">
                    {cohortEmKw
                      ? formataValor(cohort?.totalInversoresKw ?? 0, unidade)
                      : (cohort?.totalInversores ?? 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{cohortEmKw ? "kW no período" : "inversores no período"}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
