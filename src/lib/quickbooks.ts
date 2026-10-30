import * as core from "../../js/quickbooks.mjs";

export type Layout = "three" | "four";
export type DateStyle = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export interface ExportFile {
  name: string;
  rows: number;
  text: string;
}

export interface ExportResult {
  files: ExportFile[];
  summary: { count: number; moneyIn: number; moneyOut: number };
}

interface Api {
  FORMATS: Record<Layout, { label: string; header: string[] }>;
  buildExport(
    txns: { date: string; name: string; amount: number }[],
    options?: { layout?: Layout; dateStyle?: DateStyle; maxRows?: number; baseName?: string },
  ): ExportResult;
}

export const quickbooks = core as unknown as Api;

/* ---------- sync log (browser only) ---------- */

export interface LogEntry {
  at: string;
  scope: string;
  layout: Layout;
  rows: number;
  files: string[];
  moneyIn: number;
  moneyOut: number;
}

const STORE = "quickbooks.log.v1";

export function loadLog(): LogEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE) ?? "[]") as LogEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveLog(entries: LogEntry[]) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(entries.slice(0, 50)));
  } catch {
    /* storage unavailable: the log lasts for this visit only */
  }
}
