// Utilitários para visualização em "inversores" (quantidade) ou "kW" (potência).
// Fonte de potência (combinada): rma.potencia quando disponível; senão extrai do
// nome do produto (ex.: "...8000TL" = 8 kW, "...100KTL3" = 100 kW).

export type Unidade = "inversores" | "kw";

export const normProd = (s: string | null | undefined) => (s ?? "").toUpperCase().trim();

// Normaliza potência para kW. Se vier em watts (valor alto), divide por 1000.
export function normalizaKW(raw: number | null | undefined): number | null {
  if (raw == null || !isFinite(raw) || raw <= 0) return null;
  const v = raw > 1000 ? raw / 1000 : raw; // 8000 (W) -> 8 kW
  if (v <= 0 || v > 1000) return null; // descarta valores absurdos
  return v;
}

// Extrai potência (kW) do nome do produto.
export function potenciaDoNome(desc: string | null | undefined): number | null {
  const s = (desc ?? "").toUpperCase();
  if (!s) return null;

  // Padrão "NNK" / "NN.NK" (ex.: 20K, 100K, 7.5K) = kW direto
  const mK = s.match(/(\d{1,3}(?:[.,]\d+)?)\s*K(?:TL|W|LT|T|H|-|\b)/);
  if (mK) {
    const v = parseFloat(mK[1].replace(",", "."));
    if (v > 0 && v <= 1000) return v;
  }

  // Padrão em watts: número de 4-5 dígitos (ex.: 8000, 10000, 5000) -> kW
  const mW = s.match(/(\d{4,6})(?!\d)/);
  if (mW) {
    const w = parseInt(mW[1], 10);
    if (w >= 1000 && w <= 300000) return w / 1000;
  }

  return null;
}

// Cria um resolvedor de potência a partir do mapa (produto normalizado -> kW).
// Fallback: extrai do nome. Retorna kW por unidade de inversor.
export function criaResolverPotencia(powerMap: Record<string, number>) {
  const cache = new Map<string, number | null>();
  return (descricaoProduto: string | null | undefined): number | null => {
    const key = normProd(descricaoProduto);
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const doMapa = powerMap[key];
    const kw = (doMapa != null ? normalizaKW(doMapa) : null) ?? potenciaDoNome(descricaoProduto);
    cache.set(key, kw);
    return kw;
  };
}

// Converte uma quantidade de inversores de um produto para o valor na unidade escolhida.
// Em "inversores" retorna a própria quantidade; em "kw" retorna quantidade * potência
// (0 quando a potência é desconhecida).
export function valorNaUnidade(
  quantidade: number,
  descricaoProduto: string | null | undefined,
  unidade: Unidade,
  resolver: (d: string | null | undefined) => number | null
): number {
  if (unidade === "inversores") return quantidade;
  const kw = resolver(descricaoProduto);
  return kw != null ? quantidade * kw : 0;
}

// Formata um valor já calculado na unidade escolhida.
export function formataValor(valor: number, unidade: Unidade): string {
  if (unidade === "inversores") return Math.round(valor).toLocaleString("pt-BR");
  // kW: acima de 1000 exibe em MW para legibilidade
  if (valor >= 1000) {
    return `${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MW`;
  }
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kW`;
}

// Rótulo curto da unidade (para sublinhas e eixos).
export function rotuloUnidade(unidade: Unidade, plural = true): string {
  if (unidade === "inversores") return plural ? "inversores" : "inversor";
  return "kW";
}
