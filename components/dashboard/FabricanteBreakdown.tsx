"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/lib/store";
import { CaretRight, CaretDown } from "@phosphor-icons/react";

interface TreeNode {
  key: string;
  label: string;
  level: number;        // 0 = fabricante, 1 = tipo alimentação, 2 = classificação
  fabricante: string;
  produtos: string[];   // produtos (rma.produto) do grupo — enviados ao cohort como modelos
  rmaGlobal: number;    // RMAs do período (SAC único) deste grupo — a partir do rmaData
  children: TreeNode[];
}

interface Cohort { inv: number; linked: number }

function taxaColor(t: number) {
  return t > 5 ? "text-red-500" : t > 2 ? "text-amber-500" : "text-emerald-500";
}

export function FabricanteBreakdown() {
  const { rmaData, filters, unidade } = useDashboard();
  const selectedFabs = filters.fabricantes;
  const selectedKey = selectedFabs.join(",");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cohort, setCohort] = useState<Record<string, Cohort>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Árvore de grupos a partir do rmaData (fabricante -> tipo -> classificação)
  const forest = useMemo(() => {
    type Agg = { sac: Set<string>; prod: Set<string> };
    const mk = (): Agg => ({ sac: new Set(), prod: new Set() });
    const fabs = new Map<string, Agg & { tipos: Map<string, Agg & { classes: Map<string, Agg> }> }>();

    for (const r of rmaData) {
      const fab = r.fabricante;
      if (!fab || !selectedFabs.includes(fab)) continue;
      const tipo = r.tipo_alimentacao?.trim() || "Não informado";
      const classif = r.classificacao || "Não classificado";
      const sacKey = r.sac ?? `__id_${r.id}`;
      const prod = r.produto?.trim();

      let f = fabs.get(fab);
      if (!f) { f = { ...mk(), tipos: new Map() }; fabs.set(fab, f); }
      f.sac.add(sacKey); if (prod) f.prod.add(prod);

      let t = f.tipos.get(tipo);
      if (!t) { t = { ...mk(), classes: new Map() }; f.tipos.set(tipo, t); }
      t.sac.add(sacKey); if (prod) t.prod.add(prod);

      let c = t.classes.get(classif);
      if (!c) { c = mk(); t.classes.set(classif, c); }
      c.sac.add(sacKey); if (prod) c.prod.add(prod);
    }

    return selectedFabs
      .filter((fab) => fabs.has(fab))
      .map((fab) => {
        const f = fabs.get(fab)!;
        const tipos = [...f.tipos.entries()]
          .sort((a, b) => b[1].sac.size - a[1].sac.size)
          .map(([tipo, t]) => {
            const classes = [...t.classes.entries()]
              .sort((a, b) => b[1].sac.size - a[1].sac.size)
              .map(([classif, c]): TreeNode => ({
                key: `F:${fab}|T:${tipo}|C:${classif}`,
                label: classif, level: 2, fabricante: fab,
                produtos: [...c.prod], rmaGlobal: c.sac.size, children: [],
              }));
            return {
              key: `F:${fab}|T:${tipo}`, label: tipo, level: 1, fabricante: fab,
              produtos: [...t.prod], rmaGlobal: t.sac.size, children: classes,
            } as TreeNode;
          });
        return {
          key: `F:${fab}`, label: fab, level: 0, fabricante: fab,
          produtos: [...f.prod], rmaGlobal: f.sac.size, children: tipos,
        } as TreeNode;
      });
  }, [rmaData, selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invalida cache quando filtros mudam
  const fsig = `${filters.dateStart}|${filters.dateEnd}|${filters.apenasAtivos}|${selectedKey}`;
  useEffect(() => {
    genRef.current++;
    setCohort({});
    setExpanded(new Set());
    fetchingRef.current = new Set();
  }, [fsig]);

  // Nós visíveis (topo + filhos de nós expandidos)
  const visible = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        out.push(n);
        if (expanded.has(n.key) && n.children.length) walk(n.children);
      }
    };
    walk(forest);
    return out;
  }, [forest, expanded]);

  // Busca cohort (vendido + corte) para cada nó visível, de forma independente.
  // Cada resultado é aplicado assim que chega; nada é cancelado no meio do caminho
  // (evita travar em "…"). Um "generation guard" descarta respostas de filtros antigos.
  useEffect(() => {
    for (const n of visible) {
      if (n.key in cohort || fetchingRef.current.has(n.key)) continue;
      fetchingRef.current.add(n.key);
      const gen = genRef.current;
      (async () => {
        let result: Cohort = { inv: 0, linked: 0 };
        try {
          const params = new URLSearchParams({ type: "cohort", fabricantes: n.fabricante });
          if (filters.dateStart) params.set("dateStart", filters.dateStart);
          if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
          if (filters.apenasAtivos) params.set("apenasAtivos", "1");
          if (n.level > 0 && n.produtos.length) params.set("modelos", n.produtos.join(","));
          const r = await fetch(`/api/analytics?${params}`);
          if (r.ok) {
            const d = await r.json();
            result = { inv: d.totalInversores ?? 0, linked: d.linkedRMACount ?? 0 };
          }
        } catch {
          // mantém zeros
        } finally {
          fetchingRef.current.delete(n.key);
        }
        if (mountedRef.current && gen === genRef.current) {
          setCohort((prev) => ({ ...prev, [n.key]: result }));
        }
      })();
    }
  }, [visible, cohort, filters.dateStart, filters.dateEnd, filters.apenasAtivos]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  if (selectedFabs.length === 0) return null;

  const levelPad = ["pl-4", "pl-9", "pl-14"];

  return (
    <div className="bg-white rounded-xl border border-slate-100 border-l-4 border-l-indigo-400 shadow-card mb-5 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
          Taxas por Fabricante Selecionado
          {unidade === "kw" && <span className="ml-1.5 text-slate-300 normal-case tracking-normal">(em inversores)</span>}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">Clique para expandir: Fabricante → Tipo de Alimentação → Classificação</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="text-left font-bold px-4 py-1.5">Grupo</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Global</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Corte</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">Qtd. Vendido</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">Qtd. RMA (Global)</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">Qtd. RMA (Corte)</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const c = cohort[n.key];
              const hasChildren = n.children.length > 0;
              const isOpen = expanded.has(n.key);
              const taxaGlobal = c && c.inv > 0 ? (n.rmaGlobal / c.inv) * 100 : 0;
              const taxaCorte = c && c.inv > 0 ? (c.linked / c.inv) * 100 : 0;
              const nameColor = n.level === 0 ? "text-slate-700 font-semibold" : n.level === 1 ? "text-slate-600" : "text-slate-500";
              return (
                <tr
                  key={n.key}
                  className={`border-t border-slate-50 ${hasChildren ? "cursor-pointer hover:bg-slate-50/60" : ""} ${n.level > 0 ? "bg-slate-50/30" : ""} transition-colors`}
                  onClick={hasChildren ? () => toggle(n.key) : undefined}
                >
                  <td className={`py-1 ${levelPad[n.level]} pr-4 truncate max-w-[280px] ${nameColor}`} title={n.label}>
                    <span className="inline-flex items-center gap-1">
                      {hasChildren
                        ? (isOpen ? <CaretDown size={10} weight="bold" className="text-slate-400 shrink-0" /> : <CaretRight size={10} weight="bold" className="text-slate-400 shrink-0" />)
                        : <span className="w-[10px] shrink-0" />}
                      {n.label}
                    </span>
                  </td>
                  <td className={`px-4 py-1 text-right font-bold ${c ? taxaColor(taxaGlobal) : "text-slate-300"}`}>
                    {c ? `${taxaGlobal.toFixed(2)}%` : "…"}
                  </td>
                  <td className={`px-4 py-1 text-right font-bold ${c ? taxaColor(taxaCorte) : "text-slate-300"}`}>
                    {c ? `${taxaCorte.toFixed(2)}%` : "…"}
                  </td>
                  <td className="px-4 py-1 text-right text-slate-400">{c ? c.inv.toLocaleString("pt-BR") : "…"}</td>
                  <td className="px-4 py-1 text-right text-slate-400">{n.rmaGlobal.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-1 text-right text-slate-400">{c ? c.linked.toLocaleString("pt-BR") : "…"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
