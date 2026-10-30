import * as core from "../../js/importer.mjs";
import type { Txn } from "@/lib/reconcile";

export type Tag = "Business" | "Personal";

export interface Mapping {
  date: number;
  name: number;
  amount: number;
  debit: number;
  credit: number;
  balance: number;
}

export interface TagInfo {
  tag: Tag;
  reason: string;
  confidence: "high" | "low";
  source: "rules" | "ai";
}

export interface Parsed {
  transactions: Txn[];
  skipped: { line: number; raw: string; reason: string }[];
  duplicates: { line: number; raw: string }[];
}

interface Api {
  parseCsv(text: string): string[][];
  guessMapping(headers: string[]): Mapping;
  validateMapping(headers: string[], rows: string[][], mapping: Mapping): { mapping: Mapping; errors: string[]; notes: string[] };
  mappingFromNames(headers: string[], names: Record<string, string | null> | undefined): Mapping;
  headerKey(headers: string[]): string;
  applyMapping(rows: string[][], mapping: Mapping): Parsed;
  merchantKey(name: string): string;
  tagLocal(txn: Txn): TagInfo;
  makeMessyDemo(sampleText: string, start?: number): string;
}

export const importer = core as unknown as Api;

export const FIELD_LABELS: { key: keyof Mapping; label: string; hint: string }[] = [
  { key: "date", label: "Date", hint: "When it posted" },
  { key: "name", label: "Description", hint: "Payee or merchant" },
  { key: "amount", label: "Amount", hint: "One signed column" },
  { key: "debit", label: "Debit", hint: "Money out, if separate" },
  { key: "credit", label: "Credit", hint: "Money in, if separate" },
  { key: "balance", label: "Balance", hint: "Running balance (ignored)" },
];

/* ---------- saved mappings, one per header row ---------- */

const STORE = "import.mappings.v1";

export function loadMapping(headers: string[]): Mapping | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Record<string, Mapping>;
    return all[importer.headerKey(headers)] ?? null;
  } catch {
    return null;
  }
}

export function saveMapping(headers: string[], mapping: Mapping) {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Record<string, Mapping>;
    all[importer.headerKey(headers)] = mapping;
    window.localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    /* storage unavailable: the mapping just won't be remembered */
  }
}

/* ---------- AI helpers (the server functions fall back to "not configured") ---------- */

export async function aiConfigured(): Promise<boolean> {
  try {
    const r = await fetch("/.netlify/functions/ai-tag");
    return r.ok && ((await r.json()) as { configured?: boolean }).configured === true;
  } catch {
    return false;
  }
}

async function post<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`/.netlify/functions/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = (await r.json()) as T & { error?: string };
  if (!r.ok || out.error) throw new Error(out.error ?? `Request failed (${r.status})`);
  return out;
}

export async function aiMapping(headers: string[], sample: string[][]): Promise<Mapping | null> {
  const out = await post<{ configured: boolean; mapping?: Record<string, string | null> }>("ai-map", { headers, sample: sample.slice(0, 3) });
  return out.configured && out.mapping ? importer.mappingFromNames(headers, out.mapping) : null;
}

/** Tags unique merchants in batches; returns a map from merchant string to its AI tag. */
export async function aiTags(names: string[]): Promise<Record<string, { tag: Tag; reason: string }>> {
  const result: Record<string, { tag: Tag; reason: string }> = {};
  for (let i = 0; i < names.length; i += 100) {
    const out = await post<{ configured: boolean; tags?: typeof result }>("ai-tag", { names: names.slice(i, i + 100) });
    if (!out.configured) throw new Error("AI is not configured on this site.");
    Object.assign(result, out.tags);
  }
  return result;
}
