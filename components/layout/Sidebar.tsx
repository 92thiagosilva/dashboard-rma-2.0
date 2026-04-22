"use client";

import { useState, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartBar, Package, UploadSimple, SlidersHorizontal, CaretDown, CaretUp,
} from "@phosphor-icons/react";
import { useDashboard } from "@/lib/store";
import { ImportModal } from "@/components/ui/ImportModal";

function CheckboxItem({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 cursor-pointer group" onClick={() => onChange(!checked)}>
      <div
        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
          checked ? "bg-blue-500 border-blue-500" : "border-slate-500 group-hover:border-blue-400"
        }`}
      >
        {checked && <div className="w-2 h-1 border-b-2 border-l-2 border-white rotate-[-45deg] mt-0.5" />}
      </div>
      <span className="text-xs text-slate-300 group-hover:text-white transition-colors truncate">{label}</span>
    </label>
  );
}

function FilterSection({
  title, children, defaultOpen = true,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 hover:text-slate-200 transition-colors"
      >
        {title}
        {open ? <CaretUp size={10} /> : <CaretDown size={10} />}
      </button>
      {open && children}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    filters, setFilters, filterOptions, lastImport,
    estoqueFilters, setEstoqueFilters, estoqueFilterOptions,
  } = useDashboard();
  const [showImport, setShowImport] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const isAnalytics = pathname === "/";
  const isEstoque = pathname === "/estoque";

  const filteredModelos = useMemo(() => {
    const search = modelSearch.toLowerCase();
    return filterOptions.modelos.filter((m) => {
      // Cascade: only show models for selected fabricantes
      if (filters.fabricantes.length > 0 && !filters.fabricantes.includes(m.fabricante ?? "")) {
        return false;
      }
      // Search filter
      if (search) {
        return (
          (m.produto ?? "").toLowerCase().includes(search) ||
          (m.fabricante ?? "").toLowerCase().includes(search)
        );
      }
      return true;
    });
  }, [filterOptions.modelos, modelSearch, filters.fabricantes]);

  const allFabsSelected = filterOptions.fabricantes.length > 0 &&
    filterOptions.fabricantes.every((f) => filters.fabricantes.includes(f));

  const allModsSelected = filteredModelos.length > 0 &&
    filteredModelos.every((m) => filters.modelos.includes(m.produto ?? ""));

  return (
    <>
      <aside
        className="flex flex-col h-full overflow-hidden"
        style={{ width: "var(--sidebar-w)", background: "#0f172a", borderRight: "1px solid #1e293b" }}
      >
        {/* Logo */}
        <div className="px-5 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center shrink-0">
              <ChartBar size={13} weight="bold" className="text-white" />
            </div>
            <h1 className="text-white font-bold text-sm tracking-tight">RMA Analytics PV</h1>
          </div>
          <p className="text-slate-500 text-[10px] pl-8">Fotus Energia Solar</p>

          {/* Tabs */}
          <div className="flex mt-3 gap-1.5">
            <button
              onClick={() => router.push("/")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                isAnalytics
                  ? "bg-blue-500 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <ChartBar size={12} weight={isAnalytics ? "fill" : "regular"} />
              Analytics
            </button>
            <button
              onClick={() => router.push("/estoque")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                isEstoque
                  ? "bg-blue-500 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Package size={12} weight={isEstoque ? "fill" : "regular"} />
              Estoque
            </button>
          </div>
        </div>

        {/* Import button */}
        <div className="px-4 py-3 border-b border-slate-800/80">
          <button
            onClick={() => setShowImport(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <UploadSimple size={13} weight="bold" />
            Importar Planilhas
          </button>
          {lastImport && (
            <p className="text-[10px] text-slate-500 mt-2 text-center">
              Última importação: {new Date(lastImport).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Filters */}
        {isEstoque && (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center gap-1.5 mb-4">
              <SlidersHorizontal size={12} className="text-slate-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtros</span>
            </div>

            {/* Previsão de Envio */}
            <FilterSection title="Previsão de Envio">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block">De</label>
                <input
                  type="date"
                  value={estoqueFilters.previsaoStart}
                  onChange={(e) => setEstoqueFilters({ previsaoStart: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mt-1">Até</label>
                <input
                  type="date"
                  value={estoqueFilters.previsaoEnd}
                  onChange={(e) => setEstoqueFilters({ previsaoEnd: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                {(estoqueFilters.previsaoStart || estoqueFilters.previsaoEnd) && (
                  <button
                    onClick={() => setEstoqueFilters({ previsaoStart: "", previsaoEnd: "" })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors mt-1"
                  >
                    Limpar datas
                  </button>
                )}
              </div>
            </FilterSection>

            {/* Fabricante estoque */}
            {estoqueFilterOptions.fabricantes.length > 0 && (
              <FilterSection title="Fabricante">
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => setEstoqueFilters({ fabricantes: [...estoqueFilterOptions.fabricantes] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setEstoqueFilters({ fabricantes: [] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {estoqueFilterOptions.fabricantes.map((f) => (
                    <CheckboxItem
                      key={f}
                      label={f}
                      checked={estoqueFilters.fabricantes.includes(f)}
                      onChange={(checked) =>
                        setEstoqueFilters({
                          fabricantes: checked
                            ? [...estoqueFilters.fabricantes, f]
                            : estoqueFilters.fabricantes.filter((x) => x !== f),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* Tipo estoque */}
            {estoqueFilterOptions.tipos.length > 0 && (
              <FilterSection title="Tipo">
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => setEstoqueFilters({ tipos: [...estoqueFilterOptions.tipos] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setEstoqueFilters({ tipos: [] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {estoqueFilterOptions.tipos.map((t) => (
                    <CheckboxItem
                      key={t}
                      label={t}
                      checked={estoqueFilters.tipos.includes(t)}
                      onChange={(checked) =>
                        setEstoqueFilters({
                          tipos: checked
                            ? [...estoqueFilters.tipos, t]
                            : estoqueFilters.tipos.filter((x) => x !== t),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* CD / Empresa */}
            {estoqueFilterOptions.empresas.length > 0 && (
              <FilterSection title="CD / Empresa" defaultOpen={false}>
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => setEstoqueFilters({ empresas: [...estoqueFilterOptions.empresas] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setEstoqueFilters({ empresas: [] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {estoqueFilterOptions.empresas.map((e) => (
                    <CheckboxItem
                      key={e}
                      label={e}
                      checked={estoqueFilters.empresas.includes(e)}
                      onChange={(checked) =>
                        setEstoqueFilters({
                          empresas: checked
                            ? [...estoqueFilters.empresas, e]
                            : estoqueFilters.empresas.filter((x) => x !== e),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterSection>
            )}
          </div>
        )}

        {isAnalytics && (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center gap-1.5 mb-4">
              <SlidersHorizontal size={12} className="text-slate-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtros</span>
            </div>

            {/* Date range */}
            <FilterSection title="Período">
              <div className="space-y-1.5">
                <input
                  type="date"
                  value={filters.dateStart}
                  onChange={(e) => setFilters({ dateStart: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <input
                  type="date"
                  value={filters.dateEnd}
                  onChange={(e) => setFilters({ dateEnd: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </FilterSection>

            {/* Stock status */}
            <FilterSection title="Status (Ativo)">
              <div className="space-y-1">
                {(["Todos", "Sim", "Não"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      filters.stockStatus === v ? "border-blue-500" : "border-slate-600 group-hover:border-blue-400"
                    }`}>
                      {filters.stockStatus === v && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                    </div>
                    <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                      {v === "Sim" ? "Em estoque" : v === "Não" ? "Fora de estoque" : v}
                    </span>
                    <input
                      type="radio"
                      name="stockStatus"
                      value={v}
                      checked={filters.stockStatus === v}
                      onChange={() => setFilters({ stockStatus: v })}
                      className="hidden"
                    />
                  </label>
                ))}
              </div>
            </FilterSection>

            {/* Fabricante */}
            {filterOptions.fabricantes.length > 0 && (
              <FilterSection title="Fabricante">
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => setFilters({ fabricantes: [...filterOptions.fabricantes] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilters({ fabricantes: [] })}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {filterOptions.fabricantes.map((f) => (
                    <CheckboxItem
                      key={f}
                      label={f}
                      checked={filters.fabricantes.includes(f)}
                      onChange={(checked) =>
                        setFilters({
                          fabricantes: checked
                            ? [...filters.fabricantes, f]
                            : filters.fabricantes.filter((x) => x !== f),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* Modelo */}
            {filterOptions.modelos.length > 0 && (
              <FilterSection title="Modelo">
                <div className="flex gap-1.5 mb-2">
                  <button
                    onClick={() => {
                      const visible = filteredModelos.map((m) => m.produto ?? "");
                      setFilters({ modelos: [...new Set([...filters.modelos, ...visible])] });
                    }}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => {
                      const visible = filteredModelos.map((m) => m.produto ?? "");
                      setFilters({ modelos: filters.modelos.filter((m) => !visible.includes(m)) });
                    }}
                    className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Buscar modelo..."
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 mb-2 transition-colors"
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredModelos.map((m) => (
                    <CheckboxItem
                      key={m.produto}
                      label={m.produto ?? ""}
                      checked={filters.modelos.includes(m.produto ?? "")}
                      onChange={(checked) =>
                        setFilters({
                          modelos: checked
                            ? [...filters.modelos, m.produto ?? ""]
                            : filters.modelos.filter((x) => x !== m.produto),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* Classificação */}
            {filterOptions.classificacoes.length > 0 && (
              <FilterSection title="Classificação">
                <div className="space-y-0.5">
                  {filterOptions.classificacoes.map((c) => (
                    <CheckboxItem
                      key={c}
                      label={c}
                      checked={filters.classificacoes.includes(c)}
                      onChange={(checked) =>
                        setFilters({
                          classificacoes: checked
                            ? [...filters.classificacoes, c]
                            : filters.classificacoes.filter((x) => x !== c),
                        })
                      }
                    />
                  ))}
                </div>
              </FilterSection>
            )}
          </div>
        )}
      </aside>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </>
  );
}
