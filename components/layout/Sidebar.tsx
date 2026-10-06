"use client";

import { useState, useMemo } from "react";
import {
  ChartBar, UploadSimple, SlidersHorizontal, CaretDown, CaretUp,
  Trash, Warning, SpinnerGap,
} from "@phosphor-icons/react";
import { useDashboard } from "@/lib/store";
import { ImportModal } from "@/components/ui/ImportModal";
import { useToast } from "@/components/ui/Toast";

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
  const {
    filters, setFilters, filterOptions, lastImport,
    refreshData, unidade, setUnidade,
  } = useDashboard();
  const { show: showToast } = useToast();
  const [showImport, setShowImport] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const scope = "analytics";
  const scopeLabel = "Analytics (RMA + Vendas)";

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao limpar");
      showToast(`Dados de ${scopeLabel} removidos com sucesso.`, "success");
      refreshData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      showToast(`Erro ao limpar: ${msg}`, "error");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

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
        </div>

        {/* Import + Clear buttons */}
        <div className="px-4 py-3 border-b border-slate-800/80 space-y-2">
          <button
            onClick={() => setShowImport(true)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <UploadSimple size={13} weight="bold" />
            Importar Planilhas
          </button>

          {/* Clear data — dois estágios */}
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-transparent border border-slate-700 hover:border-red-500/60 hover:bg-red-950/30 text-slate-500 hover:text-red-400 text-xs font-medium rounded-lg transition-all"
            >
              <Trash size={12} weight="bold" />
              Limpar dados
            </button>
          ) : (
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 space-y-2">
              <div className="flex items-start gap-1.5">
                <Warning size={12} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-300 leading-relaxed">
                  Remove <span className="font-semibold">{scopeLabel}</span> do banco.
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setConfirmClear(false)}
                  disabled={clearing}
                  className="flex-1 py-1 text-[10px] font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClear}
                  disabled={clearing}
                  className="flex-1 py-1 text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  {clearing
                    ? <><SpinnerGap size={10} className="animate-spin" /> Limpando...</>
                    : <><Trash size={10} /> Confirmar</>}
                </button>
              </div>
            </div>
          )}

          {lastImport && (
            <p className="text-[10px] text-slate-500 text-center">
              Última importação: {new Date(lastImport).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center gap-1.5 mb-4">
              <SlidersHorizontal size={12} className="text-slate-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtros</span>
            </div>

            {/* Visualização: Inversores x kW */}
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Visualizar em</p>
              <div className="flex gap-1 p-0.5 bg-slate-800 rounded-lg">
                {([["inversores", "Inversores"], ["kw", "kW"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setUnidade(val)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      unidade === val ? "bg-blue-500 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

            {/* Apenas produtos ativos */}
            <div className="mb-4 rounded-lg border border-slate-800 bg-slate-800/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200">Apenas produtos ativos</p>
                  <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                    Ignora produtos com ≤ 60 vendas nos 6 meses anteriores à data final
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={filters.apenasAtivos}
                  onClick={() => setFilters({ apenasAtivos: !filters.apenasAtivos })}
                  className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
                    filters.apenasAtivos ? "bg-blue-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      filters.apenasAtivos ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

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
      </aside>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </>
  );
}
