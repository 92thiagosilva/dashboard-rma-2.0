"use client";

import { useMemo, useState } from "react";
import { CaretRight, CaretDown } from "@phosphor-icons/react";
import { useDashboard } from "@/lib/store";
import { normalizaKW, normProd, criaResolverPotencia, formataValor } from "@/lib/units";

// Prazos (em meses, contados da data da venda) em ordem crescente. A tabela os exibe do maior para o menor.
const PRAZOS = [
  { meses: 1, label: "Até 1 mês" },
  { meses: 3, label: "Até 3 meses" },
  { meses: 6, label: "Até 6 meses" },
  { meses: 12, label: "Até 1 ano" },
  { meses: 24, label: "Até 2 anos" },
  { meses: 36, label: "Até 3 anos" },
  { meses: 48, label: "Até 4 anos" },
  { meses: 60, label: "Até 5 anos" },
];
const N = PRAZOS.length;

// Soma `m` meses a uma data ISO (YYYY-MM-DD), ajustando o dia ao último do mês quando preciso.
function somaMeses(iso: string, m: number): string {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const t = mo - 1 + m;
  const ny = y + Math.floor(t / 12);
  const nm = t % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

interface Agg {
  cum: number[];   // cum[i] = valor dos RMAs abertos em até PRAZOS[i] após a venda
  total: number;   // valor de todos os RMAs do grupo com data de venda (inclui os acima de 5 anos)
}
interface ModeloNode extends Agg { nome: string }
interface PotNode extends Agg { key: string; label: string; modelos: ModeloNode[] }
interface FabNode extends Agg { nome: string; pots: PotNode[] }

const novo = (): Agg => ({ cum: new Array(N).fill(0), total: 0 });
function soma(a: Agg, idx: number, v: number) {
  a.total += v;
  for (let i = idx; i < N; i++) a.cum[i] += v; // idx = primeiro prazo que contém o RMA (N = nenhum)
}

export function RmaPorTempoDeVenda() {
  const { rmaData, loading, unidade, powerMap } = useDashboard();
  const emKW = unidade === "kw";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { raiz, fabs, semData, acima5 } = useMemo(() => {
    const resolver = criaResolverPotencia(powerMap);
    const raiz = novo();
    const fabMap = new Map<string, { agg: Agg; pots: Map<string, { agg: Agg; label: string; modelos: Map<string, Agg> }> }>();
    const vistos = new Set<string>();
    let semData = 0;
    let acima5 = 0;

    for (const r of rmaData) {
      const chave = r.sac ?? `__id_${r.id}`;
      if (vistos.has(chave)) continue; // 1 RMA por SAC
      vistos.add(chave);

      const venda = r.data_venda?.slice(0, 10);
      const criacao = r.data_criacao?.slice(0, 10);
      if (!venda || !criacao || criacao < venda) { semData++; continue; }

      let idx = N;
      for (let i = 0; i < N; i++) {
        if (criacao <= somaMeses(venda, PRAZOS[i].meses)) { idx = i; break; }
      }
      if (idx === N) acima5++;

      const prod = r.produto?.trim() || null;
      const kwRma = normalizaKW(r.potencia) ?? resolver(prod) ?? 0;
      const valor = emKW ? kwRma : 1;
      const kwProd = prod ? (normalizaKW(powerMap[normProd(prod)]) ?? normalizaKW(r.potencia)) : normalizaKW(r.potencia);
      const potKey = kwProd != null ? String(kwProd) : "—";
      const potLabel = kwProd != null ? `${kwProd.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kW` : "Sem potência";
      const fab = r.fabricante?.trim() || "Sem fabricante";

      soma(raiz, idx, valor);
      let f = fabMap.get(fab);
      if (!f) { f = { agg: novo(), pots: new Map() }; fabMap.set(fab, f); }
      soma(f.agg, idx, valor);
      let p = f.pots.get(potKey);
      if (!p) { p = { agg: novo(), label: potLabel, modelos: new Map() }; f.pots.set(potKey, p); }
      soma(p.agg, idx, valor);
      const modelo = prod ?? "Sem modelo";
      let m = p.modelos.get(modelo);
      if (!m) { m = novo(); p.modelos.set(modelo, m); }
      soma(m, idx, valor);
    }

    const fabs: FabNode[] = [...fabMap.entries()].map(([nome, f]) => ({
      nome, ...f.agg,
      pots: [...f.pots.entries()].map(([key, p]) => ({
        key, label: p.label, ...p.agg,
        modelos: [...p.modelos.entries()].map(([n, m]) => ({ nome: n, ...m })),
      })),
    }));
    return { raiz, fabs, semData, acima5 };
  }, [rmaData, powerMap, emKW]);

  const fmt = (v: number) => (emKW ? formataValor(v, unidade) : Math.round(v).toLocaleString("pt-BR"));
  const pct = (parte: number, base: number) => (base > 0 ? (parte / base) * 100 : 0);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 mb-5 h-72 skeleton" />;
  }

  // Linhas visíveis: prazo (maior → menor) → fabricante → potência → modelo
  type Linha = { key: string; nivel: number; label: string; cum: number; base: number; filhos: boolean };
  const linhas: Linha[] = [];
  for (let i = N - 1; i >= 0; i--) {
    const kW = `W${i}`;
    linhas.push({ key: kW, nivel: 0, label: PRAZOS[i].label, cum: raiz.cum[i], base: raiz.total, filhos: fabs.some((f) => f.cum[i] > 0) });
    if (!expanded.has(kW)) continue;
    const porVolume = <T extends Agg>(xs: T[]) => xs.filter((x) => x.cum[i] > 0).sort((a, b) => b.cum[i] - a.cum[i]);
    for (const f of porVolume(fabs)) {
      const kF = `${kW}|F:${f.nome}`;
      linhas.push({ key: kF, nivel: 1, label: f.nome, cum: f.cum[i], base: f.total, filhos: true });
      if (!expanded.has(kF)) continue;
      for (const p of porVolume(f.pots)) {
        const kP = `${kF}|P:${p.key}`;
        linhas.push({ key: kP, nivel: 2, label: p.label, cum: p.cum[i], base: p.total, filhos: true });
        if (!expanded.has(kP)) continue;
        for (const m of porVolume(p.modelos)) {
          linhas.push({ key: `${kP}|M:${m.nome}`, nivel: 3, label: m.nome, cum: m.cum[i], base: m.total, filhos: false });
        }
      }
    }
  }

  const pad = ["pl-4", "pl-9", "pl-14", "pl-20"];

  if (raiz.total === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-card p-5 mb-5 text-center text-slate-400 text-sm">
        Sem RMAs com data de venda para exibir
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 border-l-4 border-l-amber-400 shadow-card mb-5 overflow-hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">RMAs por Tempo desde a Venda</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Clique para expandir: Prazo → Fabricante → Potência → Modelo</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Tempo entre a NF de venda e a abertura do RMA, <span className="font-medium text-slate-500">acumulado</span> (&quot;Até 1 ano&quot; inclui os de até 6 meses).{" "}
          <span className="font-medium text-slate-500">%</span> = RMAs do grupo abertos naquele prazo ÷ total de RMAs do grupo com data de venda.
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Base: {fmt(raiz.total)} {emKW ? "de potência em RMAs" : "RMAs"} com data de venda
          {acima5 > 0 && <> ({acima5.toLocaleString("pt-BR")} abertos após mais de 5 anos entram só no total)</>}
          {semData > 0 && <>; {semData.toLocaleString("pt-BR")} RMAs sem data de venda ficam fora</>}.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="text-left font-bold px-4 py-1.5">Prazo desde a venda</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "kW RMA abertos" : "RMAs abertos"}</th>
              <th className="text-left font-bold px-4 py-1.5 w-[34%]">% dos RMAs do grupo</th>
              <th className="text-right font-bold px-4 py-1.5 whitespace-nowrap">{emKW ? "Total do grupo (kW)" : "Total do grupo"}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const p = pct(l.cum, l.base);
              const aberto = expanded.has(l.key);
              const nome = l.nivel === 0 ? "text-slate-700 font-semibold" : l.nivel === 1 ? "text-slate-600" : l.nivel === 2 ? "text-slate-500" : "text-slate-400";
              return (
                <tr
                  key={l.key}
                  className={`border-t border-slate-50 ${l.filhos ? "cursor-pointer hover:bg-slate-50/60" : ""} ${l.nivel > 0 ? "bg-slate-50/30" : ""} transition-colors`}
                  onClick={l.filhos ? () => toggle(l.key) : undefined}
                >
                  <td className={`py-1 ${pad[l.nivel]} pr-4 truncate max-w-[320px] ${nome}`} title={l.label}>
                    <span className="inline-flex items-center gap-1">
                      {l.filhos
                        ? (aberto ? <CaretDown size={10} weight="bold" className="text-slate-400 shrink-0" /> : <CaretRight size={10} weight="bold" className="text-slate-400 shrink-0" />)
                        : <span className="w-[10px] shrink-0" />}
                      {l.label}
                    </span>
                  </td>
                  <td className="px-4 py-1 text-right font-bold text-slate-700">{fmt(l.cum)}</td>
                  <td className="px-4 py-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, p)}%` }} />
                      </div>
                      <span className="w-14 text-right font-bold text-amber-600 tabular-nums">{p.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-1 text-right text-slate-400">{fmt(l.base)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
