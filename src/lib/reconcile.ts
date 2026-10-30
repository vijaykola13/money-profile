import * as core from "../../js/reconcile.mjs";

export type AccountType = "checking" | "credit";

export interface Account {
  type: AccountType;
  /** Opening balance (for a credit card, the amount owed). */
  starting: number;
  /** The date the starting balance is as of, YYYY-MM-DD. */
  asOf: string;
}

export interface Txn {
  date: string;
  name: string;
  amount: number;
}

export interface KeyedRow extends Txn {
  id: number;
  key: string;
}

export interface Cause {
  kind: "unticked" | "missing" | "duplicate" | "sign" | "transposed" | "starting";
  title: string;
  detail: string;
}

export interface HistoryItem {
  finishedAt: string;
  ending: number;
  count: number;
  type: AccountType;
}

interface Api {
  round2(n: number): number;
  computedBalance(type: AccountType, starting: number, rows: Txn[]): number;
  difference(type: AccountType, starting: number, ending: number, ticked: Txn[]): number;
  withKeys(rows: Txn[]): (Txn & { key: string })[];
  skipLocked<T extends { key: string }>(rows: T[], locked: string[]): { fresh: T[]; skipped: T[] };
  suggestCauses(args: { type: AccountType; starting: number; ending: number; rows: KeyedRow[]; tickedIds: Set<number> }): Cause[];
  carryForward(account: Account, ending: number, ticked: Txn[]): Account;
  dropDemoRow(rows: Txn[]): { transactions: Txn[]; removed: Txn | null };
}

export const reconcile = core as unknown as Api;

/* ---------- saved state (browser only) ---------- */

export interface Saved {
  account: Account;
  lockedKeys: string[];
  history: HistoryItem[];
}

const STORE = "reconcile.v1";

export const DEFAULT_ACCOUNT: Account = { type: "checking", starting: 10000, asOf: "2025-09-30" };

export function loadSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      if (s.account && Array.isArray(s.lockedKeys) && Array.isArray(s.history)) return s as Saved;
    }
  } catch {
    /* private window or blocked storage: start fresh */
  }
  return { account: DEFAULT_ACCOUNT, lockedKeys: [], history: [] };
}

export function save(s: Saved) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* storage unavailable: the session still works, it just won't be remembered */
  }
}

export function clearSaved() {
  try {
    window.localStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}
