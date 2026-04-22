"use client";

import { useState, useRef, useCallback } from "react";
import { X, UploadSimple, FileXls, CheckCircle, SpinnerGap, Warning } from "@phosphor-icons/react";
import { readExcelFile, parseVendas, parseRMA, parseEstoque, parseMTTF } from "@/lib/excel-parser";
import { useToast } from "@/components/ui/Toast";
import { useDashboard } from "@/lib/store";

const BATCH_SIZE = 3000; // linhas por request — evita 413 em arquivos grandes

const TYPE_LABELS: Record<string, string> = {
  vendas: "Relatório de Vendas",
  rma: "Relatório RMA",
  estoque: "Estoque Danificado",
  mttf: "Relatório MTTF",
  unknown: "Tipo não reconhecido",
};

const TYPE_COLORS: Record<string, string> = {
  vendas: "text-blue-400",
  rma: "text-red-400",
  estoque: "text-amber-400",
  mttf: "text-emerald-400",
  unknown: "text-slate-400",
};

interface FileStatus {
  file: File;
  type: string;
  status: "pending" | "uploading" | "success" | "error";
  rows?: number;
  error?: string;
  progress?: string; // ex: "Batch 3/34"
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { show: showToast } = useToast();
  const { refreshData, setLastImport } = useDashboard();

  const addFiles = useCallback(async (newFiles: File[]) => {
    const entries: FileStatus[] = [];
    for (const f of newFiles) {
      try {
        const { type } = await readExcelFile(f);
        entries.push({ file: f, type, status: "pending" });
      } catch {
        entries.push({ file: f, type: "unknown", status: "pending" });
      }
    }
    setFiles((prev) => [...prev, ...entries]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.match(/\.(xlsx|xls)$/i)
      );
      if (dropped.length > 0) addFiles(dropped);
    },
    [addFiles]
  );

  const handleImport = async () => {
    if (files.length === 0 || isImporting) return;
    setIsImporting(true);

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      if (entry.type === "unknown") continue;

      setFiles((prev) => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: "uploading" };
        return copy;
      });

      try {
        const { type, rows } = await readExcelFile(entry.file);
        let parsedRows: Record<string, unknown>[] = [];

        if (type === "vendas") parsedRows = parseVendas(rows) as never;
        else if (type === "rma") parsedRows = parseRMA(rows) as never;
        else if (type === "estoque") parsedRows = parseEstoque(rows) as never;
        else if (type === "mttf") parsedRows = parseMTTF(rows) as never;

        // Envia em batches para evitar 413 Request Entity Too Large
        let totalImported = 0;
        const totalBatches = Math.ceil(parsedRows.length / BATCH_SIZE);

        for (let b = 0; b < totalBatches; b++) {
          const batch = parsedRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
          const isLastBatch = b === totalBatches - 1;

          // Atualiza progresso visível ao usuário
          setFiles((prev) => {
            const copy = [...prev];
            copy[i] = { ...copy[i], progress: `${b + 1}/${totalBatches}` };
            return copy;
          });

          // Timeout de 90s por batch (evita travar para sempre)
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 90_000);

          let res: Response;
          try {
            res = await fetch("/api/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                type,
                rows: batch,
                filename: entry.file.name,
                recordHistory: isLastBatch,
                totalRows: parsedRows.length,
                truncateFirst: b === 0, // limpa dados anteriores antes do primeiro batch
              }),
            });
          } finally {
            clearTimeout(timeout);
          }

          if (!res.ok) {
            const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(json.error ?? "Erro ao importar");
          }

          const json = await res.json();
          totalImported += json.rowsImported ?? batch.length;
        }

        setFiles((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "success", rows: totalImported };
          return copy;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        setFiles((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: "error", error: msg };
          return copy;
        });
      }
    }

    setIsImporting(false);
    const now = new Date().toISOString();
    setLastImport(now);
    showToast("Importação concluída! Dados atualizados.", "success");
    refreshData();
  };

  const successCount = files.filter((f) => f.status === "success").length;
  const canImport = files.some((f) => f.status === "pending" && f.type !== "unknown");

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-slate-900 font-semibold text-base">Importar Planilhas</h2>
            <p className="text-slate-500 text-xs mt-0.5">Detecta automaticamente o tipo de arquivo</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-50"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Drop area */}
        <div className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
            }`}
          >
            <UploadSimple
              size={32}
              weight="duotone"
              className={`mx-auto mb-3 ${isDragging ? "text-blue-500" : "text-slate-400"}`}
            />
            <p className="text-sm font-medium text-slate-700">
              Arraste os arquivos ou <span className="text-blue-500">clique para selecionar</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">.xlsx ou .xls — Vendas, RMA, Estoque, MTTF</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = Array.from(e.target.files ?? []);
                if (f.length > 0) addFiles(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <FileXls size={20} weight="duotone" className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{f.file.name}</p>
                    <p className={`text-xs ${TYPE_COLORS[f.type] ?? "text-slate-400"}`}>
                      {TYPE_LABELS[f.type] ?? f.type}
                      {f.status === "uploading" && f.progress ? ` — batch ${f.progress}` : ""}
                      {f.rows ? ` — ${f.rows.toLocaleString("pt-BR")} linhas` : ""}
                      {f.error ? ` — ${f.error}` : ""}
                    </p>
                  </div>
                  {f.status === "uploading" && (
                    <SpinnerGap size={16} className="text-blue-500 animate-spin shrink-0" />
                  )}
                  {f.status === "success" && (
                    <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0" />
                  )}
                  {f.status === "error" && (
                    <Warning size={16} weight="fill" className="text-red-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          {successCount > 0 ? (
            <p className="text-xs text-emerald-600 font-medium">
              {successCount} arquivo{successCount > 1 ? "s" : ""} importado{successCount > 1 ? "s" : ""}
            </p>
          ) : (
            <p className="text-xs text-slate-400">{files.length} arquivo{files.length !== 1 ? "s" : ""} selecionado{files.length !== 1 ? "s" : ""}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport || isImporting}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
            >
              {isImporting && <SpinnerGap size={14} className="animate-spin" />}
              {isImporting ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
