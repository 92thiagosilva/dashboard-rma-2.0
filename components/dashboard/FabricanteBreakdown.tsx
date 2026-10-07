"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/lib/store";
import { CaretRight, CaretDown } from "@phosphor-icons/react";
import { normalizaKW, normProd, criaResolverPotencia, formataValor } from "@/lib/units";

interface TreeNode {
  key: string;
  label: string;
  level: number;        // 0 = fabricante, 1 = tipo alimentação, 2 = classificação
  fabricante: string;
  produtos: string[];   // produtos (rma.produto) do grupo — enviados ao cohort como modelos
  rmaGlobal: number;    // RMAs do período (SAC único) deste grupo — a partir do rmaData
  rmaGlobalKw: number;  // soma da potência (1 valor por SAC) do grupo
  children: TreeNode[];
}

interface Cohort { inv: number; linked: number; invKw: number; linkedKw: number; failed?: boolean }

function taxaColor(t: number) {
  return t > 5 ? "text-red-500" : t > 2 ? "text-amber-500" : "text-emerald-500";
}

export function FabricanteBreakdown() {
  const { rmaData, filters, unidade, powerMap } = useDashboard();
  const selectedFabs = filters.fabricantes;
  const selectedKey = selectedFabs.join(",");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cohort, setCohort] = useState<Record<string, Cohort>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<TreeNode[]>([]);
  const activeRef = useRef(0);
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const MAX_CONC = 4;

  // Árvore: fabricante -> tipo alimentação -> classificação -> potência -> modelo
  const forest = useMemo(() => {
    const resolver = criaResolverPotencia(powerMap);
    const rmaKW = (pot: number | null, prod: string | null) => normalizaKW(pot) ?? resolver(prod) ?? 0;
    type SacRow = { pot: number | null; prod: string | null };
    type Agg = { sac: Map<string, SacRow>; prod: Set<string> };
    const mk = (): Agg => ({ sac: new Map(), prod: new Set() });
    const kwOf = (a: Agg) => { let k = 0; for (const r of a.sac.values()) k += rmaKW(r.pot, r.prod); return k; };
    type PotAgg = Agg & { label: string; modelos: Map<string, Agg> };
    type ClassAgg = Agg & { pots: Map<string, PotAgg> };
    type TipoAgg = Agg & { classes: Map<string, ClassAgg> };
    type FabAgg = Agg & { tipos: Map<string, TipoAgg> };
    const fabs = new Map<string, FabAgg>();
    const bySac = (a: [string, Agg], b: [string, Agg]) => b[1].sac.size - a[1].sac.size;

    for (const r of rmaData) {
      const fab = r.fabricante;
      if (!fab || !selectedFabs.includes(fab)) continue;
      const tipo = r.tipo_alimentacao?.trim() || "Não informado";
      const classif = r.classificacao || "Não classificado";
      const sacKey = r.sac ?? `__id_${r.id}`;
      const prod = r.produto?.trim();
      const kw = prod
        ? (normalizaKW(powerMap[normProd(prod)]) ?? normalizaKW(r.potencia))
        : normalizaKW(r.potencia);
      const potKey = kw != null ? String(kw) : "—";
      const potLabel = kw != null ? `${kw.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kW` : "Sem potência";

      const sacRow: SacRow = { pot: r.potencia, prod: prod ?? null };

      let f = fabs.get(fab);
      if (!f) { f = { ...mk(), tipos: new Map() }; fabs.set(fab, f); }
      f.sac.set(sacKey, sacRow); if (prod) f.prod.add(prod);

      let t = f.tipos.get(tipo);
      if (!t) { t = { ...mk(), classes: new Map() }; f.tipos.set(tipo, t); }
      t.sac.set(sacKey, sacRow); if (prod) t.prod.add(prod);

      let c = t.classes.get(classif);
      if (!c) { c = { ...mk(), pots: new Map() }; t.classes.set(classif, c); }
      c.sac.set(sacKey, sacRow); if (prod) c.prod.add(prod);

      let p = c.pots.get(potKey);
      if (!p) { p = { ...mk(), label: potLabel, modelos: new Map() }; c.pots.set(potKey, p); }
      p.sac.set(sacKey, sacRow); if (prod) p.prod.add(prod);

      if (prod) {
        let m = p.modelos.get(prod);
        if (!m) { m = mk(); p.modelos.set(prod, m); }
        m.sac.set(sacKey, sacRow); m.prod.add(prod);
      }
    }

    return selectedFabs.filter((fab) => fabs.has(fab)).map((fab) => {
      const f = fabs.get(fab)!;
      const tipos = [...f.tipos.entries()].sort(bySac).map(([tipo, t]) => {
        const classes = [...t.classes.entries()].sort(bySac).map(([classif, c]) => {
          const pots = [...c.pots.entries()].sort(bySac).map(([potKey, p]) => {
            const modelos = [...p.modelos.entries()].sort(bySac).map(([prod, m]): TreeNode => ({
              key: `F:${fab}|T:${tipo}|C:${classif}|P:${potKey}|M:${prod}`,
              label: prod, level: 4, fabricante: fab,
              produtos: [prod], rmaGlobal: m.sac.size, rmaGlobalKw: kwOf(m), children: [],
            }));
            return {
              key: `F:${fab}|T:${tipo}|C:${classif}|P:${potKey}`,
              label: p.label, level: 3, fabricante: fab,
              produtos: [...p.prod], rmaGlobal: p.sac.size, rmaGlobalKw: kwOf(p), children: modelos,
            } as TreeNode;
          });
          return {
            key: `F:${fab}|T:${tipo}|C:${classif}`,
            label: classif, level: 2, fabricante: fab,
            produtos: [...c.prod], rmaGlobal: c.sac.size, rmaGlobalKw: kwOf(c), children: pots,
          } as TreeNode;
        });
        return {
          key: `F:${fab}|T:${tipo}`, label: tipo, level: 1, fabricante: fab,
          produtos: [...t.prod], rmaGlobal: t.sac.size, rmaGlobalKw: kwOf(t), children: classes,
        } as TreeNode;
      });
      return {
        key: `F:${fab}`, label: fab, level: 0, fabricante: fab,
        produtos: [...f.prod], rmaGlobal: f.sac.size, rmaGlobalKw: kwOf(f), children: tipos,
      } as TreeNode;
    });
  }, [rmaData, selectedKey, powerMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invalida cache quando filtros mudam
  const fsig = `${filters.dateStart}|${filters.dateEnd}|${filters.apenasAtivos}|${selectedKey}`;
  useEffect(() => {
    genRef.current++;
    setCohort({});
    setExpanded(new Set());
    fetchingRef.current = new Set();
    queueRef.current = [];
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

  // Pump: processa a fila respeitando o limite de concorrência (sem cancelar em voo,
  // para não travar em "…"). Um "generation guard" descarta respostas de filtros antigos.
  const pumpRef = useRef<() => void>(() => {});
  pumpRef.current = () => {
    while (activeRef.current < MAX_CONC && queueRef.current.length > 0) {
      const n = queueRef.current.shift()!;
      activeRef.current++;
      const gen = genRef.current;
      (async () => {
        // Falha (HTTP != 200, erro do RPC ou timeout) NÃO vira zero: tenta até 3 vezes e,
        // se continuar falhando, marca o nó como "failed" (exibido como "—").
        let result: Cohort = { inv: 0, linked: 0, invKw: 0, linkedKw: 0, failed: true };
        try {
          const params = new URLSearchParams({ type: "cohort", fabricantes: n.fabricante });
          if (filters.dateStart) params.set("dateStart", filters.dateStart);
          if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
          if (filters.apenasAtivos) params.set("apenasAtivos", "1");
          if (n.level > 0 && n.produtos.length) params.set("modelos", n.produtos.join(","));
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise((res) => setTimeout(res, 1500 * attempt));
            try {
              const r = await fetch(`/api/analytics?${params}`);
              if (!r.ok) continue;
              const d = await r.json();
              if (d._rpcError) continue;
              result = {
                inv: d.totalInversores ?? 0, linked: d.linkedRMACount ?? 0,
                invKw: d.totalInversoresKw ?? 0, linkedKw: d.linkedRMAKw ?? 0,
              };
              break;
            } catch {
              // tenta de novo
            }
          }
        } finally {
          fetchingRef.current.delete(n.key);
          activeRef.current--;
        }
        if (mountedRef.current && gen === genRef.current) {
          setCohort((prev) => ({ ...prev, [n.key]: result }));
        }
        pumpRef.current();
      })();
    }
  };

  // Enfileira nós visíveis ainda não carregados
  useEffect(() => {
    for (const n of visible) {
      if (n.key in cohort || fetchingRef.current.has(n.key)) continue;
      fetchingRef.current.add(n.key);
      queueRef.current.push(n);
    }
    pumpRef.current();
  }, [visible, cohort, filters.dateStart, filters.dateEnd, filters.apenasAtivos]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // Refaz a consulta de um nó que falhou: ao tirá-lo do cache, o efeito de fila o enfileira de novo.
  const retry = (key: string) =>
    setCohort((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  if (selectedFabs.length === 0) return null;

  const emKW = unidade === "kw";
  const levelPad = ["pl-4", "pl-9", "pl-14", "pl-20", "pl-24"];
  const fmt = (v: number) => (emKW ? formataValor(v, unidade) : v.toLocaleString("pt-BR"));

  return (
    <div className="bg-white rounded-xl border border-slate-100 border-l-4 border-l-indigo-400 shadow-card mb-5 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
          Taxas por Fabricante Selecionado
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">Clique para expandir: Fabricante → Tipo de Alimentação → Classificação → Potência → Modelo</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          <span className="font-medium text-slate-500">Global</span>: RMAs abertos no período.{" "}
          <span className="font-medium text-slate-500">Coorte</span>: RMAs de qualquer data dos inversores vendidos no período (vínculo pelo Nro. Fotus).
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="text-left font-bold px-4 py-1.5">Grupo</th>
              <th className="text-right font-bold px-4 py-1.5">Taxa Global</th>
              <th className="text-right font-bold px-4 py-1.5" title="Coorte: RMAs de qualquer data vinculados às vendas do período (Nro. Fotus) ÷ vendido no período">Taxa Coorte</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW Vendido" : "Qtd. Vendido"}</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW RMA (Global)" : "Qtd. RMA (Global)"}</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW RMA (Coorte)" : "Qtd. RMA (Coorte)"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const c = cohort[n.key];
              const loaded = !!c && !c.failed;
              const placeholder = c?.failed ? "—" : "…";
              const hasChildren = n.children.length > 0;
              const isOpen = expanded.has(n.key);
              const vendido = loaded ? (emKW ? c!.invKw : c!.inv) : 0;
              const rmaGlobal = emKW ? n.rmaGlobalKw : n.rmaGlobal;
              const corte = loaded ? (emKW ? c!.linkedKw : c!.linked) : 0;
              const taxaGlobal = loaded && vendido > 0 ? (rmaGlobal / vendido) * 100 : 0;
              const taxaCorte = loaded && vendido > 0 ? (corte / vendido) * 100 : 0;
              const nameColor = n.level === 0 ? "text-slate-700 font-semibold" : n.level === 1 ? "text-slate-600" : n.level === 2 ? "text-slate-500" : "text-slate-400";
              return (
                <tr
                  key={n.key}
                  className={`border-t border-slate-50 ${hasChildren || c?.failed ? "cursor-pointer hover:bg-slate-50/60" : ""} ${n.level > 0 ? "bg-slate-50/30" : ""} transition-colors`}
                  title={c?.failed ? "Falhou ao carregar — clique para tentar de novo" : undefined}
                  onClick={c?.failed ? () => retry(n.key) : hasChildren ? () => toggle(n.key) : undefined}
                >
                  <td className={`py-1 ${levelPad[n.level]} pr-4 truncate max-w-[280px] ${nameColor}`} title={n.label}>
                    <span className="inline-flex items-center gap-1">
                      {hasChildren
                        ? (isOpen ? <CaretDown size={10} weight="bold" className="text-slate-400 shrink-0" /> : <CaretRight size={10} weight="bold" className="text-slate-400 shrink-0" />)
                        : <span className="w-[10px] shrink-0" />}
                      {n.label}
                    </span>
                  </td>
                  <td className={`px-4 py-1 text-right font-bold ${loaded ? taxaColor(taxaGlobal) : "text-slate-300"}`}>
                    {loaded ? `${taxaGlobal.toFixed(2)}%` : placeholder}
                  </td>
                  <td className={`px-4 py-1 text-right font-bold ${loaded ? taxaColor(taxaCorte) : "text-slate-300"}`}>
                    {loaded ? `${taxaCorte.toFixed(2)}%` : placeholder}
                  </td>
                  <td className="px-4 py-1 text-right text-slate-400">{loaded ? fmt(vendido) : placeholder}</td>
                  <td className="px-4 py-1 text-right text-slate-400">{fmt(rmaGlobal)}</td>
                  <td className="px-4 py-1 text-right text-slate-400">{loaded ? fmt(corte) : placeholder}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
