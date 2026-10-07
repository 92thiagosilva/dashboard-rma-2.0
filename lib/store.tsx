"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { FilterState } from "@/lib/analytics";
import { calcularClassificacao } from "@/lib/analytics";
import type { Unidade } from "@/lib/units";

// --- Types ---
export interface RMARow {
  id: string;
  cod_produto: string | null;
  data_criacao: string | null;
  data_venda: string | null;
  sn: string | null;
  estado: string | null;
  sac: string | null;
  problematica: string | null;
  nro_fotus: string | null;
  produto: string | null;
  classificacao: string | null;
  tipo_alimentacao: string | null;
  potencia: number | null;
  fabricante: string | null;
  ativo: string | null;
  mttf_dias: number | null;
}

export interface VendasRow {
  id: string;
  data_venda: string | null;
  cod_produto: string | null;
  descricao_produto: string | null;
  quantidade_vendida: number | null;
  estado: string | null;
  numero_fotus: string | null;
}

// Vendas agregadas no servidor por mês (YYYY-MM) e produto (UPPER/TRIM).
export interface VendasMensalRow {
  mes: string;
  produto: string;
  qtd: number;
}

// Produto que já teve RMA em qualquer data (estrutura da árvore por fabricante).
export interface TreeCatalogRow {
  fabricante: string;
  produto: string;
  tipo_alimentacao: string | null;
  potencia: number | null;
}

export interface FilterOptions {
  fabricantes: string[];
  modelos: Array<{ produto: string | null; fabricante: string | null }>;
  classificacoes: string[];
}

interface DashboardStore {
  rmaData: RMARow[];
  vendasData: VendasRow[];
  vendasMensal: VendasMensalRow[] | null;
  treeCatalog: TreeCatalogRow[];
  vendasTruncadas: boolean;            // vendas brutas no limite de linhas (lista incompleta)
  produtosClasse: string[] | null;     // produtos das classes marcadas (null = sem filtro de classe)
  filterOptions: FilterOptions;
  filters: FilterState;
  crossFilter: { type: string | null; value: string | null };
  loading: boolean;
  lastImport: string | null;
  unidade: Unidade;
  powerMap: Record<string, number>;
  setUnidade: (u: Unidade) => void;
  setFilters: (f: Partial<FilterState>) => void;
  setCrossFilter: (type: string, value: string) => void;
  clearCrossFilter: () => void;
  refreshData: () => void;
  setLastImport: (d: string) => void;
}

// --- Cache utilities (sessionStorage — persiste no F5, limpa ao fechar a aba) ---
const CACHE_V = "rma_v2";

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_V}_${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: unknown) {
  try {
    sessionStorage.setItem(`${CACHE_V}_${key}`, JSON.stringify(value));
  } catch {
    // quota exceeded — ignora silenciosamente
  }
}

function cacheClear() {
  try {
    const keys = Object.keys(sessionStorage).filter((k) => k.startsWith(CACHE_V));
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

// ---

const DashboardContext = createContext<DashboardStore | null>(null);

const DEFAULT_FILTERS: FilterState = {
  dateStart: "",
  dateEnd: "",
  fabricantes: [],
  modelos: [],
  classificacoes: [],
  apenasAtivos: false,
};

const normProduto = (s: string | null | undefined) => (s ?? "").toUpperCase().trim();

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  // Hidrata imediatamente do cache para evitar tela vazia no reload
  // Reaplica override de classificação mesmo nos dados em cache
  const [rmaData, setRmaData] = useState<RMARow[]>(() =>
    (cacheGet<RMARow[]>("rma") ?? []).map((r) => ({
      ...r,
      classificacao: calcularClassificacao(r.tipo_alimentacao, r.potencia),
    }))
  );
  const [vendasData, setVendasData] = useState<VendasRow[]>(() => cacheGet<VendasRow[]>("vendas") ?? []);
  const [vendasMensalRaw, setVendasMensal] = useState<VendasMensalRow[] | null>(null);
  const [treeCatalogRaw, setTreeCatalogRaw] = useState<TreeCatalogRow[]>(() => cacheGet<TreeCatalogRow[]>("treeCatalog") ?? []);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(
    () => cacheGet<FilterOptions>("filterOptions") ?? { fabricantes: [], modelos: [], classificacoes: [] }
  );
  const [filters, setFiltersState] = useState<FilterState>(
    () => cacheGet<FilterState>("filtersState") ?? DEFAULT_FILTERS
  );
  const [crossFilter, setCrossFilterState] = useState<{ type: string | null; value: string | null }>({
    type: null,
    value: null,
  });
  // Se já há cache, não mostra loading na abertura
  const [loading, setLoading] = useState(() => {
    const hasCached = !!cacheGet("rma");
    return !hasCached;
  });
  const [lastImport, setLastImportState] = useState<string | null>(
    () => cacheGet<string>("lastImport")
  );

  // Conjunto de produtos ATIVOS (nomes normalizados UPPER/TRIM) para o filtro
  // "Apenas produtos ativos". Buscado server-side pois a janela de 6 meses pode
  // estar fora do período filtrado.
  const [produtosAtivos, setProdutosAtivos] = useState<Set<string>>(new Set());
  const [ativosReady, setAtivosReady] = useState(false);

  // Visualização em inversores (quantidade) ou kW (potência)
  const [unidade, setUnidadeState] = useState<Unidade>(() => cacheGet<Unidade>("unidade") ?? "inversores");
  const [powerMap, setPowerMap] = useState<Record<string, number>>(() => cacheGet<Record<string, number>>("powerMap") ?? {});

  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);
  // Ref para filterOptions — permite que fetchData (deps=[]) acesse o valor mais recente
  const filterOptionsRef = useRef<FilterOptions>({ fabricantes: [], modelos: [], classificacoes: [] });
  filterOptionsRef.current = filterOptions;

  // Consulta pendente aguardando as opções de filtro (ver fetchData)
  const pendingFetchRef = useRef<{ f: FilterState; silent: boolean } | null>(null);

  const fetchData = useCallback(async (f: FilterState, silent = false, semEspera = false): Promise<void> => {
    // Sem as opções de filtro não dá para saber se a seleção é um subconjunto real; enviar a
    // consulta agora traria TODOS os fabricantes mesmo com algum desmarcado. Espera as opções
    // (fetchFilterOptions dispara a consulta pendente ao terminar, com sucesso ou falha).
    if (!semEspera && f.fabricantes.length > 0 && filterOptionsRef.current.fabricantes.length === 0) {
      pendingFetchRef.current = { f, silent };
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    if (!silent) setLoading(true);

    try {
      // Só envia fabricantes/modelos quando o usuário reduziu a seleção (subconjunto real).
      // Com todos selecionados, não envia parâmetro → API usa query direta sem join com rma,
      // evitando excluir vendas de produtos que nunca tiveram RMA.
      const opts = filterOptionsRef.current;
      const fabTrulyFiltered = opts.fabricantes.length > 0 && f.fabricantes.length < opts.fabricantes.length;
      const modTrulyFiltered = opts.modelos.length > 0 && f.modelos.length < opts.modelos.length;

      const params = new URLSearchParams();
      if (f.dateStart) params.set("dateStart", f.dateStart);
      if (f.dateEnd) params.set("dateEnd", f.dateEnd);
      if (fabTrulyFiltered) params.set("fabricantes", f.fabricantes.join(","));
      if (modTrulyFiltered) params.set("modelos", f.modelos.join(","));
      // Classificação NÃO é enviada ao servidor — é calculada client-side
      // via calcularClassificacao(tipo_alimentacao, potencia)

      // Carga com tentativas: o servidor responde 200 mesmo quando uma das consultas falha
      // (errors.rma / errors.vendas preenchido e lista vazia). Sem retry, isso virava
      // "0 vendido" na tela até o próximo reload. Sem nenhum filtro enviado ao servidor,
      // vendas vazias também é tratado como falha, pois nunca é um resultado legítimo.
      const signal = abortRef.current.signal;
      const semFiltroServidor = !f.dateStart && !f.dateEnd && !fabTrulyFiltered && !modTrulyFiltered;
      const MAX_TENTATIVAS = 3;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
        if (tentativa > 0) {
          await new Promise((r) => setTimeout(r, 2000 * tentativa));
          if (signal.aborted) return;
        }
        const res = await fetch(`/api/analytics?${params}`, { signal });
        if (!res.ok) continue;
        const d = await res.json();
        data = d;
        const falhou =
          !!d.errors?.rma || !!d.errors?.vendas ||
          (semFiltroServidor && (d.vendas ?? []).length === 0);
        if (!falhou) break;
      }
      if (!data) return;

      // Override classificacao conforme regras Fotus (tipo_alimentacao + potencia)
      const rmaWithClass = (data.rma ?? []).map((r: RMARow) => ({
        ...r,
        classificacao: calcularClassificacao(r.tipo_alimentacao, r.potencia),
      }));

      // Aplica filtro de classificação client-side (quando não todas selecionadas)
      const TODAS_CLASS = ["Pequeno Porte", "Médio Porte", "Grande Porte", "Não classificado"];
      const filtrarClass = f.classificacoes.length > 0 && f.classificacoes.length < TODAS_CLASS.length;
      const rmaFinal: RMARow[] = filtrarClass
        ? rmaWithClass.filter((r: RMARow) => f.classificacoes.includes(r.classificacao ?? ""))
        : rmaWithClass;

      setRmaData(rmaFinal);
      setVendasData(data.vendas ?? []);

      // Vendas truncadas no limite de 120k linhas: busca a série mensal agregada no servidor
      // para a linha do tempo não perder meses. Se falhar, a linha do tempo usa os dados do cliente.
      if ((data.vendas ?? []).length >= 120000) {
        // Em segundo plano: não segura o loading da tela; até chegar, vale a série do cliente.
        setVendasMensal(null);
        const mp = new URLSearchParams(params);
        mp.set("type", "vendas-mensal");
        fetch(`/api/analytics?${mp}`, { signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((m) => { if (!signal.aborted) setVendasMensal(Array.isArray(m?.rows) ? m.rows : null); })
          .catch(() => { if (!signal.aborted) setVendasMensal(null); });
      } else {
        setVendasMensal(null);
      }

      // Salva no cache apenas quando não há filtros ativos (dados "completos")
      const noFilters =
        !f.dateStart && !f.dateEnd &&
        f.fabricantes.length === 0 &&
        f.modelos.length === 0 &&
        f.classificacoes.length === 0;
      if (noFilters && !data.errors?.rma && !data.errors?.vendas) {
        cacheSet("rma", rmaWithClass); // cache com classificação já calculada
        cacheSet("vendas", data.vendas ?? []);
      }
    } catch {
      // aborted ou erro — ignora
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFilterOptions = useCallback(async (silent = false) => {
    try {
      const res = await fetch("/api/analytics?type=filters");
      if (!res.ok) return;
      const data = await res.json();

      // Classificações são fixas pelas regras Fotus (tipo_alimentacao + potencia)
      const CLASSIFICACOES_FIXAS = ["Pequeno Porte", "Médio Porte", "Grande Porte", "Não classificado"];
      const mergedData = { ...data, classificacoes: CLASSIFICACOES_FIXAS };
      setFilterOptions(mergedData);
      filterOptionsRef.current = mergedData; // já disponível para a consulta pendente (o ref só atualiza no próximo render)
      cacheSet("filterOptions", mergedData);

      // Só inicializa filtros na primeira carga (para não sobrescrever seleção do usuário)
      if (!initializedRef.current) {
        initializedRef.current = true;
        const cachedFilters = cacheGet<FilterState>("filtersState");
        if (!cachedFilters || cachedFilters.fabricantes.length === 0) {
          const initFilters: FilterState = {
            ...DEFAULT_FILTERS,
            fabricantes: data.fabricantes ?? [],
            modelos: data.modelos?.map((m: { produto: string | null }) => m.produto).filter(Boolean) ?? [],
            classificacoes: CLASSIFICACOES_FIXAS,
          };
          setFiltersState(initFilters);
          cacheSet("filtersState", initFilters);
        }
      }
    } catch {
      // ignora
    } finally {
      // Dispara a consulta que ficou esperando as opções. Em caso de falha das opções,
      // segue sem esperar (melhor mostrar os dados do que ficar em "carregando").
      const pendente = pendingFetchRef.current;
      if (pendente) {
        pendingFetchRef.current = null;
        fetchData(pendente.f, pendente.silent, true);
      }
    }
  }, [fetchData]);

  // Na montagem: se há cache, faz refresh silencioso em background
  // Se não há cache, faz fetch normal com loading
  useEffect(() => {
    const hasCached = !!cacheGet("rma");
    fetchFilterOptions(hasCached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebusca dados quando filtros mudam
  // Na inicialização com cache: não mostra loading (silent)
  const filtersInitialized = useRef(false);
  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true;
      // Primeira vez: silent se tiver cache
      const hasCached = !!cacheGet("rma");
      if (hasCached && filters.fabricantes.length > 0) {
        fetchData(filters, true); // refresh silencioso em background
      } else if (!hasCached) {
        fetchData(filters, false);
      }
      return;
    }
    fetchData(filters, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Busca o conjunto de produtos ativos quando o filtro é ligado (ou dateEnd muda)
  useEffect(() => {
    if (!filters.apenasAtivos) {
      setAtivosReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ type: "active-products" });
        if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
        const res = await fetch(`/api/analytics?${params}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setProdutosAtivos(new Set<string>((data.produtos ?? []).map(normProduto)));
        setAtivosReady(true);
      } catch {
        // ignora
      }
    })();
    return () => { cancelled = true; };
  }, [filters.apenasAtivos, filters.dateEnd]);

  // Busca o mapa de potência (produto -> kW) uma vez na montagem
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics?type=power-map");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const map = (data.map ?? {}) as Record<string, number>;
        setPowerMap(map);
        cacheSet("powerMap", map);
      } catch {
        // ignora
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Catálogo de produtos com RMA em qualquer data (uma vez na montagem)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics?type=tree-catalog");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.rows)) return;
        setTreeCatalogRaw(data.rows);
        cacheSet("treeCatalog", data.rows);
      } catch {
        // ignora — a árvore cai para os RMAs do período
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setUnidade = useCallback((u: Unidade) => {
    setUnidadeState(u);
    cacheSet("unidade", u);
  }, []);

  // Deriva rmaData/vendasData filtrados por produtos ativos (ponto único que
  // alimenta todos os KPIs, gráficos, insights e tabela).
  const rmaDataView = useMemo(() => {
    if (!filters.apenasAtivos || !ativosReady) return rmaData;
    return rmaData.filter((r) => produtosAtivos.has(normProduto(r.produto)));
  }, [rmaData, filters.apenasAtivos, ativosReady, produtosAtivos]);

  // Classificação só existe nos RMAs (tipo de alimentação + potência). Para a venda, a classe
  // vem do produto: com um subconjunto de classes marcado, só contam os produtos do catálogo
  // (os que já tiveram RMA) cuja classe esteja marcada — o mesmo critério da árvore.
  // null = sem filtro de classe (ou catálogo ainda não carregado).
  const classKey = filters.classificacoes.join(",");
  const produtosClasse = useMemo(() => {
    const subconjunto = filters.classificacoes.length > 0 && filters.classificacoes.length < 4;
    if (!subconjunto || treeCatalogRaw.length === 0) return null;
    const nomes = new Set<string>();
    for (const c of treeCatalogRaw) {
      if (filters.classificacoes.includes(calcularClassificacao(c.tipo_alimentacao, c.potencia) ?? "")) nomes.add(c.produto);
    }
    return nomes;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treeCatalogRaw, classKey]);
  const produtosClasseNorm = useMemo(
    () => (produtosClasse ? new Set([...produtosClasse].map(normProduto)) : null),
    [produtosClasse]
  );

  const produtosClasseArr = useMemo(() => (produtosClasse ? [...produtosClasse] : null), [produtosClasse]);

  // Vendas brutas no limite de linhas = lista truncada (a decisão não pode olhar a lista já filtrada)
  const vendasTruncadas = vendasData.length >= 120000;

  const vendasDataView = useMemo(() => {
    let out = vendasData;
    if (filters.apenasAtivos && ativosReady) out = out.filter((v) => produtosAtivos.has(normProduto(v.descricao_produto)));
    if (produtosClasseNorm) out = out.filter((v) => produtosClasseNorm.has(normProduto(v.descricao_produto)));
    return out;
  }, [vendasData, filters.apenasAtivos, ativosReady, produtosAtivos, produtosClasseNorm]);

  const vendasMensal = useMemo(() => {
    if (!vendasMensalRaw) return null;
    let out = vendasMensalRaw;
    if (filters.apenasAtivos && ativosReady) out = out.filter((v) => produtosAtivos.has(normProduto(v.produto)));
    if (produtosClasseNorm) out = out.filter((v) => produtosClasseNorm.has(normProduto(v.produto)));
    return out;
  }, [vendasMensalRaw, filters.apenasAtivos, ativosReady, produtosAtivos, produtosClasseNorm]);

  const treeCatalog = useMemo(() => {
    if (!filters.apenasAtivos || !ativosReady) return treeCatalogRaw;
    return treeCatalogRaw.filter((c) => produtosAtivos.has(normProduto(c.produto)));
  }, [treeCatalogRaw, filters.apenasAtivos, ativosReady, produtosAtivos]);

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...partial };
      cacheSet("filtersState", next);
      return next;
    });
  }, []);

  const setCrossFilter = useCallback((type: string, value: string) => {
    setCrossFilterState({ type, value });
  }, []);

  const clearCrossFilter = useCallback(() => {
    setCrossFilterState({ type: null, value: null });
  }, []);

  const setLastImport = useCallback((d: string) => {
    setLastImportState(d);
    cacheSet("lastImport", d);
  }, []);

  // Após importação: limpa cache e rebusca tudo
  const refreshData = useCallback(() => {
    cacheClear();
    initializedRef.current = false;
    filtersInitialized.current = false;
    fetchFilterOptions(false);
  }, [fetchFilterOptions]);

  return (
    <DashboardContext.Provider
      value={{
        rmaData: rmaDataView,
        vendasData: vendasDataView,
        vendasMensal,
        vendasTruncadas,
        produtosClasse: produtosClasseArr,
        treeCatalog,
        filterOptions,
        filters,
        crossFilter,
        loading,
        lastImport,
        unidade,
        powerMap,
        setUnidade,
        setFilters,
        setCrossFilter,
        clearCrossFilter,
        refreshData,
        setLastImport,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used inside DashboardProvider");
  return ctx;
}
