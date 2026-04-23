"use client";

import * as XLSX from "xlsx";
import type { Database } from "@/lib/supabase/types";

type VendasInsert = Database["public"]["Tables"]["vendas"]["Insert"];
type RMAInsert = Database["public"]["Tables"]["rma"]["Insert"];
type EstoqueInsert = Database["public"]["Tables"]["estoque_danificado"]["Insert"];
type MTTFInsert = Database["public"]["Tables"]["mttf_referencia"]["Insert"];

export type DetectedFileType = "vendas" | "rma" | "estoque" | "mttf" | "unknown";

function parseExcelDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }
  if (typeof val === "string") {
    const str = val.trim();
    // dd/mm/yyyy
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  }
  return null;
}

function normalizeKey(key: string): string {
  return key.trim().toUpperCase().replace(/\s+/g, " ");
}

function rowToNormalized(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k in row) out[normalizeKey(k)] = row[k];
  return out;
}

export function detectFileType(headers: string[]): DetectedFileType {
  const normalized = headers.map((h) => normalizeKey(h));
  if (normalized.includes("PROBLEMÁTICA") || normalized.includes("PROBLEMATICA") || normalized.includes("NRO. FOTUS"))
    return "rma";
  if (normalized.includes("QUANTIDADE VENDIDA") || (normalized.includes("NUMERO FOTUS") && normalized.includes("DESCRIÇÃO DO PRODUTO")))
    return "vendas";
  if (normalized.includes("SAC") && normalized.includes("CD") && normalized.includes("STATUS"))
    return "estoque";
  if (normalized.includes("MÉDIA DE MTTF") || normalized.includes("MEDIA DE MTTF"))
    return "mttf";
  return "unknown";
}

export function parseVendas(rows: Record<string, unknown>[]): VendasInsert[] {
  return rows.map((r) => {
    const n = rowToNormalized(r);
    return {
      data_venda: parseExcelDate(n["DATA DA VENDA"]),
      cod_produto: String(n["CÓD. DO PRODUTO"] ?? n["COD. DO PRODUTO"] ?? n["CÓD DO PRODUTO"] ?? "").trim() || null,
      descricao_produto: String(n["DESCRIÇÃO DO PRODUTO"] ?? n["DESCRICAO DO PRODUTO"] ?? "").trim() || null,
      quantidade_vendida: Number(n["QUANTIDADE VENDIDA"]) || 1,
      estado: String(n["ESTADO"] ?? "").trim().toUpperCase().slice(0, 2) || null,
      numero_fotus: String(n["NUMERO FOTUS"] ?? "").trim() || null,
    };
  });
}

export function parseRMA(rows: Record<string, unknown>[]): RMAInsert[] {
  return rows.map((r) => {
    const n = rowToNormalized(r);
    return {
      cod_produto: String(n["CÓD. DO PRODUTO"] ?? n["COD. DO PRODUTO"] ?? "").trim() || null,
      data_criacao: parseExcelDate(n["DATA DE CRIAÇÃO"] ?? n["DATA DE CRIACAO"]),
      data_venda: parseExcelDate(n["DATA DA VENDA"]),
      sn: String(n["SN"] ?? "").trim() || null,
      estado: String(n["ESTADO"] ?? "").trim().toUpperCase().slice(0, 2) || null,
      sac: n["SAC"] != null ? String(n["SAC"]).trim() || null : null,
      problematica: String(n["PROBLEMÁTICA"] ?? n["PROBLEMATICA"] ?? "").trim() || null,
      nro_fotus: String(n["NRO. FOTUS"] ?? n["NRO FOTUS"] ?? "").trim() || null,
      produto: String(n["PRODUTO"] ?? "").trim() || null,
      classificacao: String(n["CLASSIFICAÇÃO"] ?? n["CLASSIFICACAO"] ?? "").trim() || null,
      tipo_alimentacao: String(n["TIPO DE ALIMENTAÇÃO"] ?? n["TIPO DE ALIMENTACAO"] ?? "").trim() || null,
      potencia: Number(n["POTÊNCIA"] ?? n["POTENCIA"]) || null,
      fabricante: String(n["FABRICANTE"] ?? "").trim() || null,
      ativo: String(n["ATIVO"] ?? "Não").trim() || "Não",
    };
  });
}

export function parseEstoque(rows: Record<string, unknown>[]): EstoqueInsert[] {
  return rows.map((r) => {
    const n = rowToNormalized(r);
    return {
      sn: String(n["SN"] ?? "").trim() || null,
      cod_produto: String(n["COD.PRODUTO"] ?? n["CÓD. DO PRODUTO"] ?? "").trim() || null,
      produto: String(n["PRODUTO"] ?? "").trim() || null,
      fabricante: String(n["FABRICANTE"] ?? "").trim() || null,
      sac: String(n["SAC"] ?? "").trim() || null,
      cd: String(n["CD"] ?? "").trim() || null,
      empresa: String(n["EMPRESA"] ?? "").trim() || null,
      tipo: String(n["TIPO"] ?? "").trim() || null,
      status: String(n["STATUS"] ?? "").trim() || null,
      previsao_envio: parseExcelDate(n["PREVISÃO DE ENVIO"] ?? n["PREVISAO DE ENVIO"]),
      nf_retorno: String(n["NF DE RETORNO"] ?? "").trim() || null,
      nf_envio_fabricante: String(n["NF DE ENVIO P/ FABRICANTE"] ?? "").trim() || null,
      data_envio: parseExcelDate(n["DATA DE ENVIO"]),
      custo_produto: n["CUSTO DO PRODUTO"] != null ? Number(n["CUSTO DO PRODUTO"]) || null : null,
    };
  });
}

export function parseMTTF(rows: Record<string, unknown>[]): MTTFInsert[] {
  return rows.map((r) => {
    const n = rowToNormalized(r);
    return {
      produto: String(n["PRODUTO"] ?? "").trim(),
      media_mttf: Number(n["MÉDIA DE MTTF"] ?? n["MEDIA DE MTTF"]) || null,
      ativo: String(n["ATIVO"] ?? "").trim() || null,
    };
  }).filter((r) => r.produto);
}

export async function readExcelFile(file: File): Promise<{
  type: DetectedFileType;
  rows: Record<string, unknown>[];
  headers: string[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        if (json.length === 0) return reject(new Error("Planilha vazia"));
        const headers = Object.keys(json[0]);
        const type = detectFileType(headers);
        resolve({ type, rows: json, headers });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.readAsArrayBuffer(file);
  });
}
