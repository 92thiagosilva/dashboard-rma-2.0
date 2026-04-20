"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { FilterState } from "@/lib/analytics";

// --- Types ---
export interface RMARow {
  id: string;
  cod_produto: string | null;
  data_criacao: string | null;
  data_venda: string | null;
  sn: string | null;
  estado: string | null;
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

interface DashboardStore {
  rmaData: RMARow[];
  vendasData: VendasRow[];
  filterOptions: FilterOptions;
  filters: FilterState;
  crossFilter: { type: string | null; value: string | null };
  loading: boolean;
  lastImport: string | null;
  setFilters: (f: Partial<FilterState>) => void;
  setCrossFilter: (type: string, value: string) => void;
  clearCrossFilter: () => void;
  refreshData: () => void;
  setLastImport: (d: string) => void;
}

const DashboardContext = createContext<DashboardStore | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [rmaData, setRmaData] = useState<RMARow[]>([]);
  const [vendasData, setVendasData] = useState<VendasRow[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    fabricantes: [],
    modelos: [],
    classificacoes: [],
  });
  const [filters, setFiltersState] = useState<FilterState>({
    dateStart: "",
    dateEnd: "",
    stockStatus: "Todos",
    fabricantes: [],
    modelos: [],
    classificacoes: [],
  });
  const [crossFilter, setCrossFilterState] = useState<{ type: string | null; value: string | null }>({
    type: null,
    value: null,
  });
  const [loading, setLoading] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (f: FilterState) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (f.dateStart) params.set("dateStart", f.dateStart);
      if (f.dateEnd) params.set("dateEnd", f.dateEnd);
      if (f.stockStatus !== "Todos") params.set("stockStatus", f.stockStatus);
      if (f.fabricantes.length > 0) params.set("fabricantes", f.fabricantes.join(","));
      if (f.modelos.length > 0) params.set("modelos", f.modelos.join(","));
      if (f.classificacoes.length > 0) params.set("classificacoes", f.classificacoes.join(","));

      const res = await fetch(`/api/analytics?${params}`, { signal: abortRef.current.signal });
      if (!res.ok) return;
      const data = await res.json();
      setRmaData(data.rma ?? []);
      setVendasData(data.vendas ?? []);
    } catch {
      // aborted or error — silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics?type=filters");
      if (!res.ok) return;
      const data = await res.json();
      setFilterOptions(data);
      // Initialize with all selected
      setFiltersState((prev) => ({
        ...prev,
        fabricantes: data.fabricantes ?? [],
        modelos: data.modelos?.map((m: { produto: string | null }) => m.produto).filter(Boolean) ?? [],
        classificacoes: data.classificacoes ?? [],
      }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchData(filters);
  }, [filters, fetchData]);

  const setFilters = useCallback((partial: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setCrossFilter = useCallback((type: string, value: string) => {
    setCrossFilterState({ type, value });
  }, []);

  const clearCrossFilter = useCallback(() => {
    setCrossFilterState({ type: null, value: null });
  }, []);

  const refreshData = useCallback(() => {
    fetchFilterOptions();
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
