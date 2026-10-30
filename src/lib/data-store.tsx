import { MORTGAGE_KEYS } from "@/lib/mortgage";
import { scopedStorage } from "@/lib/storage";
import * as React from "react";
import { dataset } from "@/lib/dataset";
import { clearAudit, logEvent } from "@/lib/audit";
import { importer as I, loadMapping } from "@/lib/importer";
import { useBankData, type Account, type PlaidPayload } from "@/lib/live-data";
import { saveLog } from "@/lib/quickbooks";
import { clearSaved, type Txn } from "@/lib/reconcile";

/** Where the user's transactions come from. The choice is theirs, and is remembered. */
export type Mode = "files" | "live";
export type Kind = "none" | "sample" | "file" | "live";

export interface Source {
  kind: Kind;
  label: string;
  transactions: Txn[];
  /** The same transactions as a canonical CSV, for the tabs that read CSV text. */
  csv: string;
}

export interface IngestResult {
  ok: boolean;
  error?: string;
  notes: string[];
  count: number;
  skipped: number;
  duplicates: number;
}

interface Ctx {
  mode: Mode;
  setMode: (m: Mode) => void;
  source: Source;
  plaid: PlaidPayload | null;
  bankLoading: boolean;
  bankStatus: "off" | "loading" | "connected" | "not-configured" | "error";
  bankMessage: string;
  accounts: Account[];
  /** Replaces the shared data with transactions that are already mapped. */
  publish: (transactions: Txn[], label: string, kind: Exclude<Kind, "none" | "live">) => void;
  /** Maps any bank CSV (any column order) and publishes it, or says why it can't. */
  ingestRaw: (text: string, label: string, kind?: "file" | "sample") => Promise<IngestResult>;
  loadSample: () => Promise<IngestResult>;
  clear: () => void;
  /** Said once after a switch that wiped the previous data. */
  notice: string;
  dismissNotice: () => void;
}

const SAMPLE = "/samples/test_accountable_plan_usbank.csv";
const EMPTY: Source = { kind: "none", label: "", transactions: [], csv: "" };
const MODE_KEY = "data.mode.v1";
const DATA_KEY = "data.source.v1";
const MAX_PERSIST = 2_000_000;

const DataContext = React.createContext<Ctx | null>(null);

function read<T>(key: string): T | null {
  try {
    const raw = scopedStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    const text = JSON.stringify(value);
    if (text.length <= MAX_PERSIST) scopedStorage.setItem(key, text);
  } catch {
    /* storage unavailable or full: the data lasts for this visit only */
  }
}

/**
 * Wipes everything that belongs to the loaded data: the file, reconciliation progress, export log and activity trail.
 * Preferences stay (data source choice, taught merchant tags, saved column mappings, theme).
 */
function clearWorkspace() {
  try {
    scopedStorage.removeItem(DATA_KEY);
    scopedStorage.removeItem(MORTGAGE_KEYS.data);
    scopedStorage.removeItem(MORTGAGE_KEYS.settings);
  } catch {
    /* ignore */
  }
  clearSaved();
  saveLog([]);
  clearAudit();
}

function build(kind: Source["kind"], label: string, transactions: Txn[]): Source {
  return { kind, label, transactions, csv: transactions.length ? dataset.toCanonicalCsv(transactions) : "" };
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<Mode>(() => (read<Mode>(MODE_KEY) === "live" ? "live" : "files"));
  const [stored, setStored] = React.useState<Source>(() => {
    const saved = read<{ kind: Source["kind"]; label: string; csv: string }>(DATA_KEY);
    if (!saved || !saved.csv || saved.kind === "live" || saved.kind === "none") return EMPTY;
    return build(saved.kind, saved.label, dataset.fromCanonicalCsv(saved.csv));
  });

  const { plaid, loading: bankLoading, status: bankStatus, message: bankMessage } = useBankData(mode === "live");

  const live = React.useMemo<Source | null>(() => {
    if (mode !== "live" || !plaid?.transactions?.length) return null;
    const txns: Txn[] = plaid.transactions.map((t) => ({ date: t.date, name: t.name, amount: t.amount }));
    return build("live", `Live: Plaid ${plaid.env ?? "sandbox"}`, txns);
  }, [mode, plaid]);

  // In live mode only live data is shown.
  const source = mode === "live" ? (live ?? EMPTY) : stored;

  const [notice, setNotice] = React.useState("");
  const modeRef = React.useRef(mode);
  modeRef.current = mode;

  // Switching between uploading and a live connection starts clean: nothing from the other source carries over.
  const setMode = React.useCallback((m: Mode) => {
    if (m === modeRef.current) return;
    clearWorkspace();
    setStored(EMPTY);
    modeRef.current = m;
    setModeState(m);
    write(MODE_KEY, m);
    logEvent("data", m === "live" ? "Switched to a live connection; previous data cleared" : "Switched to uploaded files; previous data cleared");
    setNotice(
      m === "live"
        ? "Switched to live data. Your uploaded file and working data were cleared."
        : "Switched to uploaded files. Live data was cleared; load a statement to begin.",
    );
  }, []);

  const dismissNotice = React.useCallback(() => setNotice(""), []);

  const publish = React.useCallback<Ctx["publish"]>((transactions, label, kind) => {
    const next = build(kind, label, transactions);
    setStored(next);
    write(DATA_KEY, { kind, label, csv: next.csv });
    logEvent("import", `${transactions.length} transactions from ${label}`);
  }, []);

  const ingestRaw = React.useCallback<Ctx["ingestRaw"]>(
    async (text, label, kind = "file") => {
      const table = I.parseCsv(text);
      if (table.length < 2) return { ok: false, error: "That file has no data rows.", notes: [], count: 0, skipped: 0, duplicates: 0 };
      const headers = table[0];
      const rows = table.slice(1);
      const v = I.validateMapping(headers, rows, loadMapping(headers) ?? I.guessMapping(headers));
      if (v.errors.length) {
        return {
          ok: false,
          error: `Couldn't map the columns: ${v.errors.join(" ")} Use the Import tab to choose them yourself.`,
          notes: v.notes,
          count: 0,
          skipped: 0,
          duplicates: 0,
        };
      }
      const parsed = I.applyMapping(rows, v.mapping);
      if (!parsed.transactions.length) return { ok: false, error: "No readable transactions in that file.", notes: v.notes, count: 0, skipped: parsed.skipped.length, duplicates: parsed.duplicates.length };
      publish(parsed.transactions, label, kind);
      return { ok: true, notes: v.notes, count: parsed.transactions.length, skipped: parsed.skipped.length, duplicates: parsed.duplicates.length };
    },
    [publish],
  );

  const loadSample = React.useCallback<Ctx["loadSample"]>(async () => {
    try {
      const res = await fetch(SAMPLE);
      if (!res.ok) throw new Error("missing");
      return await ingestRaw(await res.text(), "Sample: US Bank export, Oct 2025 – Sep 2026", "sample");
    } catch {
      return { ok: false, error: "Couldn't load the sample file.", notes: [], count: 0, skipped: 0, duplicates: 0 };
    }
  }, [ingestRaw]);

  const clear = React.useCallback(() => {
    clearWorkspace();
    setStored(EMPTY);
    logEvent("data", "Cleared the loaded data");
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({ mode, setMode, source, plaid, bankLoading, bankStatus, bankMessage, accounts: plaid?.accounts ?? [], publish, ingestRaw, loadSample, clear, notice, dismissNotice }),
    [mode, setMode, source, plaid, bankLoading, bankStatus, bankMessage, publish, ingestRaw, loadSample, clear, notice, dismissNotice],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}
