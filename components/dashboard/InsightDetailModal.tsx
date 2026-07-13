"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Package, Warning, MapPin, Lightning, SpinnerGap } from "@phosphor-icons/react";
import type { RMARow, VendasRow } from "@/lib/store";
import type { FilterState } from "@/lib/analytics";

export type InsightSelection =
  | { type: "produto"; key: string; color: "purple" | "red" }
  | { type: "defeito"; key: string }
  | { type: "estado"; key: string };

interface Props {
  selection: InsightSelection;
  rmaData: RMARow[];
  vendasData: VendasRow[];
  filters: FilterState;
  onClose: () => void;
}

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().trim();

function topEntries(map: Record<string, number>, n = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

interface CohortData {
  linkedRMACount: number;
  totalInversores: number;
  taxa: number;
}

export function InsightDetailModal({ selection, rmaData, vendasData, filters, onClose }: Props) {
  const [cohort, setCohort] = useState<CohortData | null>(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Fecha com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Busca taxa por coorte apenas para produtos
  useEffect(() => {
    if (selection.type !== "produto") return;
    let cancelled = false;
    setCohortLoading(true);
    setCohort(null);
    (async () => {
      try {
        const params = new URLSearchParams({ type: "cohort", modelos: selection.key });
        if (filters.dateStart) params.set("dateStart", filters.dateStart);
        if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
        const res = await fetch(`/api/analytics?${params}`);
        if (!res.ok || cancelled) return;
        const data: CohortData = await res.json();
        if (!cancelled) setCohort(data);
      } catch {
        // ignora
      } finally {
        if (!cancelled) setCohortLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selection, filters.dateStart, filters.dateEnd]);

  const detail = useMemo(() => {
    if (selection.type === "produto") {
      const key = selection.key;
      const rows = rmaData.filter((r) => r.produto === key);

      // Vendidos: match case-insensitive (mesma lógica dos KPIs / cohort)
      const nk = norm(key);
      const vendidos = vendasData.reduce(
        (s, v) => (norm(v.descricao_produto) === nk ? s + (v.quantidade_vendida ?? 0) : s), 0
      );

      // Total RMA deduplicado por SAC (consistente com KPI global)
      const sacSet = new Set(rows.map((r) => r.sac ?? `__id_${r.id}`));
      const totalRMA = sacSet.size;

      const defeitos: Record<string, number> = {};
      const estados: Record<string, number> = {};
      const classes: Record<string, number> = {};
      let mttfSoma = 0, mttfCount = 0;
      let fabricante = "—";
      for (const r of rows) {
        if (r.problematica) defeitos[r.problematica] = (defeitos[r.problematica] ?? 0) + 1;
        if (r.estado) estados[r.estado] = (estados[r.estado] ?? 0) + 1;
        if (r.classificacao) classes[r.classificacao] = (classes[r.classificacao] ?? 0) + 1;
        if (r.mttf_dias && r.mttf_dias > 0 && r.mttf_dias < 36500) { mttfSoma += r.mttf_dias; mttfCount += 1; }
        if (r.fabricante) fabricante = r.fabricante;
      }

      return {
        kind: "produto" as const,
        rows: rows.length,
        vendidos,
        totalRMA,
        taxaGlobal: vendidos > 0 ? (totalRMA / vendidos) * 100 : 0,
        fabricante,
        topDefeito: topEntries(defeitos, 1)[0] ?? null,
        topEstado: topEntries(estados, 1)[0] ?? null,
        classificacao: topEntries(classes, 1)[0]?.[0] ?? "—",
        mttfMedio: mttfCount > 0 ? Math.round(mttfSoma / mttfCount) : null,
        defeitos: topEntries(defeitos),
        estados: topEntries(estados),
      };
    }

    // defeito ou estado
    const isDefeito = selection.type === "defeito";
    const rows = rmaData.filter((r) => (isDefeito ? r.problematica : r.estado) === selection.key);
    const produtos: Record<string, number> = {};
    const fabricantes: Record<string, number> = {};
    const outraDim: Record<string, number> = {}; // estados (se defeito) ou defeitos (se estado)
    for (const r of rows) {
      if (r.produto) produtos[r.produto] = (produtos[r.produto] ?? 0) + 1;
      if (r.fabricante) fabricantes[r.fabricante] = (fabricantes[r.fabricante] ?? 0) + 1;
      const od = isDefeito ? r.estado : r.problematica;
      if (od) outraDim[od] = (outraDim[od] ?? 0) + 1;
    }
    return {
      kind: "dim" as const,
      total: rows.length,
      pctTotal: rmaData.length > 0 ? (rows.length / rmaData.length) * 100 : 0,
      produtos: topEntries(produtos),
      fabricantes: topEntries(fabricantes),
      outraDim: topEntries(outraDim),
    };
  }, [selection, rmaData, vendasData]);

  if (!mounted) return null;

  const headerIcon =
    selection.type === "produto" ? <Package size={18} weight="duotone" /> :
    selection.type === "defeito" ? <Warning size={18} weight="duotone" /> :
    <MapPin size={18} weight="duotone" />;

  const headerLabel =
    selection.type === "produto" ? "Produto" :
    selection.type === "defeito" ? "Defeito" : "Estado";

  const accent = selection.type === "produto" && selection.color === "red" ? "text-red-500"
    : selection.type === "produto" ? "text-purple-500"
    : selection.type === "defeito" ? "text-amber-500" : "text-blue-500";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1 ${accent}`}>
              {headerIcon}
              {headerLabel}
            </div>
            <h2 className="text-base font-bold text-slate-800 leading-tight break-words">{selection.key}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {detail.kind === "produto" && (
            <>
              {/* Stat grid */}
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Inversores vendidos" value={detail.vendidos.toLocaleString("pt-BR")} accent="blue" />
                <Stat label="Total de RMAs" value={detail.totalRMA.toLocaleString("pt-BR")} accent="red" />
                <Stat
                  label="Taxa de falha (global)"
                  value={`${detail.taxaGlobal.toFixed(2)}%`}
                  accent={detail.taxaGlobal > 5 ? "red" : detail.taxaGlobal > 2 ? "amber" : "green"}
                />
                <Stat
                  label="Taxa por coorte"
                  value={cohortLoading ? "…" : cohort ? `${cohort.taxa.toFixed(2)}%` : "—"}
                  accent="green"
                  sub={cohort ? `${cohort.linkedRMACount} RMAs / ${cohort.totalInversores.toLocaleString("pt-BR")} inv.` : undefined}
                  loading={cohortLoading}
                />
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Meta label="Fabricante" value={detail.fabricante} />
                <Meta label="Classificação" value={detail.classificacao} />
                <Meta label="Defeito mais comum" value={detail.topDefeito ? `${detail.topDefeito[0]} (${detail.topDefeito[1]})` : "—"} />
                <Meta label="Estado com mais RMAs" value={detail.topEstado ? `${detail.topEstado[0]} (${detail.topEstado[1]})` : "—"} />
                <Meta label="MTTF médio" value={detail.mttfMedio != null ? `${detail.mttfMedio} dias` : "sem dados"} />
                <Meta label="Linhas de RMA" value={detail.rows.toLocaleString("pt-BR")} />
              </div>

              {detail.defeitos.length > 0 && (
                <ListSection title="Defeitos deste produto" icon={<Warning size={12} weight="fill" className="text-amber-500" />} entries={detail.defeitos} />
              )}
              {detail.estados.length > 0 && (
                <ListSection title="Estados com mais RMAs" icon={<MapPin size={12} weight="fill" className="text-blue-500" />} entries={detail.estados} />
              )}
            </>
          )}

          {detail.kind === "dim" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total de RMAs" value={detail.total.toLocaleString("pt-BR")} accent="red" />
                <Stat label="% do total filtrado" value={`${detail.pctTotal.toFixed(1)}%`} accent="purple" />
              </div>

              <ListSection title="Produtos mais afetados" icon={<Package size={12} weight="fill" className="text-purple-500" />} entries={detail.produtos} />
              <ListSection
                title={selection.type === "defeito" ? "Estados mais afetados" : "Defeitos mais comuns"}
                icon={selection.type === "defeito" ? <MapPin size={12} weight="fill" className="text-blue-500" /> : <Warning size={12} weight="fill" className="text-amber-500" />}
                entries={detail.outraDim}
              />
              <ListSection title="Fabricantes" icon={<Lightning size={12} weight="fill" className="text-slate-500" />} entries={detail.fabricantes} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Stat({ label, value, accent, sub, loading }: {
  label: string; value: string; accent: "blue" | "red" | "amber" | "green" | "purple"; sub?: string; loading?: boolean;
}) {
  const colors = {
    blue: "text-blue-600", red: "text-red-600", amber: "text-amber-600", green: "text-emerald-600", purple: "text-purple-600",
  };
  return (
    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold tracking-tight ${colors[accent]} flex items-center gap-1.5`}>
        {loading && <SpinnerGap size={14} className="animate-spin" />}
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-xs font-medium text-slate-700 break-words" title={value}>{value}</p>
    </div>
  );
}

function ListSection({ title, icon, entries }: {
  title: string; icon: React.ReactNode; entries: [string, number][];
}) {
  const max = entries[0]?.[1] ?? 1;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-1.5">
        {entries.map(([name, count]) => (
          <div key={name} className="flex items-center gap-2">
            <span className="text-xs text-slate-600 truncate flex-1" title={name}>{name}</span>
            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-slate-300 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-xs font-semibold text-slate-700 shrink-0 w-8 text-right">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
