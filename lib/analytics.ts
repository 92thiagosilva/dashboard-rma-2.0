export interface FilterState {
  dateStart: string;
  dateEnd: string;
  stockStatus: "Todos" | "Sim" | "Não";
  fabricantes: string[];
  modelos: string[];
  classificacoes: string[];
}

export const DEFAULT_FILTERS: FilterState = {
  dateStart: "",
  dateEnd: "",
  stockStatus: "Todos",
  fabricantes: [],
  modelos: [],
  classificacoes: [],
};

export interface KPIData {
  totalVendas: number;
  totalRMA: number;
  taxaFalha: number;
  estadosAfetados: number;
  rmaDia: number;
  rmaMes: number;
}

export interface InsightData {
  maiorVolume: { modelo: string; total: number };
  maiorTaxa: { modelo: string; taxa: number };
  defeitoComum: { defeito: string; total: number };
  maiorEstado: { estado: string; total: number };
}

export interface TimelinePoint {
  mes: string;
  vendas: number;
  rma: number;
}

export interface ModeloFalha {
  produto: string;
  fabricante: string;
  totalRMA: number;
  totalVendas: number;
  taxaFalha: number;
  mttfMedio: number | null;
}

export interface DefeitoItem {
  defeito: string;
  total: number;
  pct: number;
}

export interface EstadoItem {
  estado: string;
  totalRMA: number;
}

export interface MTTFItem {
  produto: string;
  fabricante: string;
  mttfMedio: number;
  totalRMA: number;
}

export interface SolarInsight {
  fabricantesAlerta: { fabricante: string; taxa: number }[];
  classificacaoBreakdown: { classificacao: string; total: number; pct: number }[];
  melhorMTTF: { produto: string; mttf: number } | null;
  piorMTTF: { produto: string; mttf: number } | null;
  mesComMaisRMA: { mes: string; total: number } | null;
}

export interface ConfiabilidadeFabricante {
  fabricante: string;
  mttfMedio: number;
  totalRMA: number;
  nivel: "critico" | "atencao" | "bom"; // <180d | 180-730d | >730d
}

export interface JanelaFalhas {
  precoce: number;   // < 365 dias (1º ano)
  normal: number;    // 365–1825 dias (1–5 anos)
  tardia: number;    // > 1825 dias (> 5 anos)
  semDados: number;  // sem mttf_dias
  total: number;
}

export interface ConfiabilidadeInsight {
  rankingFabricantes: ConfiabilidadeFabricante[];
  janelaFalhas: JanelaFalhas;
  tipoAlimentacao: { tipo: string; total: number; pct: number }[];
  piorMTTFAlerta: { produto: string; fabricante: string; mttf: number } | null;
}

export function calcularConfiabilidadeInsights(
  rmaData: Array<{
    fabricante: string | null;
    produto: string | null;
    mttf_dias: number | null;
    tipo_alimentacao: string | null;
  }>
): ConfiabilidadeInsight {
  const mttfPorFab: Record<string, { total: number; count: number }> = {};
  const rmaPorFab: Record<string, number> = {};
  const mttfPorProd: Record<string, { total: number; count: number; fab: string }> = {};
  const rmaPorTipo: Record<string, number> = {};
  const janela: JanelaFalhas = { precoce: 0, normal: 0, tardia: 0, semDados: 0, total: rmaData.length };

  for (const r of rmaData) {
    const fab = r.fabricante ?? "Desconhecido";
    const tipo = r.tipo_alimentacao?.trim() || "Não informado";

    rmaPorFab[fab] = (rmaPorFab[fab] ?? 0) + 1;
    rmaPorTipo[tipo] = (rmaPorTipo[tipo] ?? 0) + 1;

    const dias = r.mttf_dias;
    if (dias && dias > 0 && dias < 36500) {
      if (!mttfPorFab[fab]) mttfPorFab[fab] = { total: 0, count: 0 };
      mttfPorFab[fab].total += dias;
      mttfPorFab[fab].count += 1;

      if (r.produto) {
        if (!mttfPorProd[r.produto]) mttfPorProd[r.produto] = { total: 0, count: 0, fab };
        mttfPorProd[r.produto].total += dias;
        mttfPorProd[r.produto].count += 1;
      }

      if (dias < 365) janela.precoce += 1;
      else if (dias <= 1825) janela.normal += 1;
      else janela.tardia += 1;
    } else {
      janela.semDados += 1;
    }
  }

  // Ranking fabricantes por MTTF médio (mínimo 3 RMAs para ser relevante)
  const rankingFabricantes: ConfiabilidadeFabricante[] = Object.entries(mttfPorFab)
    .filter(([, v]) => v.count >= 3)
    .map(([fab, v]) => {
      const mttfMedio = Math.round(v.total / v.count);
      return {
        fabricante: fab,
        mttfMedio,
        totalRMA: rmaPorFab[fab] ?? 0,
        nivel: mttfMedio < 180 ? "critico" : mttfMedio < 730 ? "atencao" : "bom",
      };
    })
    .sort((a, b) => b.mttfMedio - a.mttfMedio)
    .slice(0, 6);

  // Tipo de alimentação breakdown
  const totalTipo = Object.values(rmaPorTipo).reduce((s, v) => s + v, 0);
  const tipoAlimentacao = Object.entries(rmaPorTipo)
    .map(([tipo, total]) => ({
      tipo,
      total,
      pct: totalTipo > 0 ? Math.round((total / totalTipo) * 100 * 10) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  // Produto com menor MTTF (mínimo 5 ocorrências para ser relevante)
  const prodEntries = Object.entries(mttfPorProd)
    .filter(([, v]) => v.count >= 5)
    .map(([prod, v]) => ({
      produto: prod,
      fabricante: v.fab,
      mttf: Math.round(v.total / v.count),
    }));

  const piorMTTFAlerta = prodEntries.length > 0
    ? prodEntries.reduce((a, b) => (a.mttf < b.mttf ? a : b))
    : null;

  return { rankingFabricantes, janelaFalhas: janela, tipoAlimentacao, piorMTTFAlerta };
}

export function calcularSolarInsights(
  rmaData: Array<{
    fabricante: string | null;
    classificacao: string | null;
    mttf_dias: number | null;
    produto: string | null;
    data_criacao: string | null;
  }>,
  vendasPorFabricante: Record<string, number>
): SolarInsight {
  const rmaPorFab: Record<string, number> = {};
  const rmaPorClass: Record<string, number> = {};
  const mttfPorProd: Record<string, { total: number; count: number; fab: string }> = {};
  const rmaPorMes: Record<string, number> = {};

  for (const r of rmaData) {
    const fab = r.fabricante ?? "Desconhecido";
    const cls = r.classificacao ?? "Desconhecido";
    rmaPorFab[fab] = (rmaPorFab[fab] ?? 0) + 1;
    rmaPorClass[cls] = (rmaPorClass[cls] ?? 0) + 1;

    if (r.produto && r.mttf_dias && r.mttf_dias > 0 && r.mttf_dias < 36500) {
      if (!mttfPorProd[r.produto]) mttfPorProd[r.produto] = { total: 0, count: 0, fab };
      mttfPorProd[r.produto].total += r.mttf_dias;
      mttfPorProd[r.produto].count += 1;
    }

    if (r.data_criacao) {
      const mes = r.data_criacao.slice(0, 7);
      rmaPorMes[mes] = (rmaPorMes[mes] ?? 0) + 1;
    }
  }

  const totalRMA = rmaData.length;

  const fabricantesAlerta = Object.entries(rmaPorFab)
    .map(([fab, rma]) => {
      const vendas = vendasPorFabricante[fab] ?? 0;
      const taxa = vendas > 0 ? (rma / vendas) * 100 : 0;
      return { fabricante: fab, taxa };
    })
    .filter((f) => f.taxa > 5)
    .sort((a, b) => b.taxa - a.taxa);

  const classificacaoBreakdown = Object.entries(rmaPorClass)
    .map(([cls, total]) => ({
      classificacao: cls,
      total,
      pct: totalRMA > 0 ? Math.round((total / totalRMA) * 100 * 10) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const mttfEntries = Object.entries(mttfPorProd).map(([prod, v]) => ({
    produto: prod,
    mttf: Math.round(v.total / v.count),
  }));

  const melhorMTTF = mttfEntries.length > 0
    ? mttfEntries.reduce((a, b) => (a.mttf > b.mttf ? a : b))
    : null;
  const piorMTTF = mttfEntries.length > 0
    ? mttfEntries.reduce((a, b) => (a.mttf < b.mttf ? a : b))
    : null;

  const mesComMaisRMA = Object.entries(rmaPorMes).length > 0
    ? Object.entries(rmaPorMes).reduce((a, b) => (a[1] > b[1] ? a : b))
    : null;

  return {
    fabricantesAlerta,
    classificacaoBreakdown,
    melhorMTTF,
    piorMTTF,
    mesComMaisRMA: mesComMaisRMA
      ? { mes: formatMesLabel(mesComMaisRMA[0]), total: mesComMaisRMA[1] }
      : null,
  };
}

function formatMesLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(m, 10) - 1]}/${y}`;
}
