"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { FilterState } from "@/lib/analytics";
import { calcularClassificacao } from "@/lib/analytics";

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

export interface FilterOptions {
  fabricantes: string[];
  modelos: Array<{ produto: string | null; fabricante: string | null }>;
  classificacoes: string[];
}

export interface EstoqueFilters {
  fabricantes: string[];
  tipos: string[];
  empresas: string[];
  status: string[];
  previsaoStart: string;
  previsaoEnd: string;
}

export interface EstoqueFilterOptions {
  fabricantes: string[];
  tipos: string[];
  empresas: string[];
}

export const DEFAULT_ESTOQUE_FILTERS: EstoqueFilters = {
  fabricantes: [],
  tipos: [],
  empresas: [],
  status: [],
  previsaoStart: "",
  previsaoEnd: "",
};

interface DashboardStore {
  rmaData: RMARow[];
  vendasData: VendasRow[];
  filterOptions: FilterOptions;
  filters: FilterState;
  crossFilter: { type: string | null; value: string | null };
  loading: boolean;
  lastImport: string | null;
  estoqueFilters: EstoqueFilters;
  estoqueFilterOptions: EstoqueFilterOptions;
  setFilters: (f: Partial<FilterState>) => void;
  setCrossFilter: (type: string, value: string) => void;
  clearCrossFilter: () => void;
  refreshData: () => void;
  setLastImport: (d: string) => void;
  setEstoqueFilters: (f: Partial<EstoqueFilters>) => void;
  setEstoqueFilterOptions: (opts: EstoqueFilterOptions) => void;
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
  stockStatus: "Todos",
  fabricantes: [],
  modelos: [],
  classificacoes: [],
};

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
  const [estoqueFilters, setEstoqueFiltersState] = useState<EstoqueFilters>(
    () => cacheGet<EstoqueFilters>("estoqueFilters") ?? DEFAULT_ESTOQUE_FILTERS
  );
  const [estoqueFilterOptions, setEstoqueFilterOptionsState] = useState<EstoqueFilterOptions>(
    () => cacheGet<EstoqueFilterOptions>("estoqueFilterOptions") ?? { fabricantes: [], tipos: [], empresas: [] }
  );

  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  const fetchData = useCallback(async (f: FilterState, silent = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    if (!silent) setLoading(true);

    try {
      const params = new URLSearchParams();
      if (f.dateStart) params.set("dateStart", f.dateStart);
      if (f.dateEnd) params.set("dateEnd", f.dateEnd);
      if (f.stockStatus !== "Todos") params.set("stockStatus", f.stockStatus);
      if (f.fabricantes.length > 0) params.set("fabricantes", f.fabricantes.join(","));
      if (f.modelos.length > 0) params.set("modelos", f.modelos.join(","));
      // Classificação NÃO é enviada ao servidor — é calculada client-side
      // via calcularClassificacao(tipo_alimentacao, potencia)

      const res = await fetch(`/api/analytics?${params}`, { signal: abortRef.current.signal });
      if (!res.ok) return;
      const data = await res.json();

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

      // Salva no cache apenas quando não há filtros ativos (dados "completos")
      const noFilters =
        !f.dateStart && !f.dateEnd &&
        f.stockStatus === "Todos" &&
        f.fabricantes.length === 0 &&
        f.modelos.length === 0 &&
        f.classificacoes.length === 0;
      if (noFilters) {
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
    }
  }, []);

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

  const setEstoqueFilters = useCallback((partial: Partial<EstoqueFilters>) => {
    setEstoqueFiltersState((prev) => {
      const next = { ...prev, ...partial };
      cacheSet("estoqueFilters", next);
      return next;
    });
  }, []);

  const setEstoqueFilterOptions = useCallback((opts: EstoqueFilterOptions) => {
    setEstoqueFilterOptionsState(opts);
    cacheSet("estoqueFilterOptions", opts);
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
        rmaData,
        vendasData,
        filterOptions,
        filters,
        crossFilter,
        loading,
        lastImport,
        estoqueFilters,
        estoqueFilterOptions,
        setFilters,
        setCrossFilter,
        clearCrossFilter,
        refreshData,
        setLastImport,
        setEstoqueFilters,
        setEstoqueFilterOptions,
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
