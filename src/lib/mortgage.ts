import * as core from "../../js/mortgage.mjs";
import { scopedStorage } from "@/lib/storage";

export interface Payment {
  date: string;
  year: number;
  month: number;
  payment: number;
  principal: number | null;
  interest: number | null;
  escrow: number;
  fees: number;
  balance: number | null;
  derived: boolean;
  estimated: boolean;
}

export interface ReadResult {
  rows: Payment[];
  skipped: { line: number; raw: string }[];
  duplicates: number;
  warnings: string[];
  hasInterest: boolean;
}

export interface Terms {
  rate: string | number;
  balance: string | number;
  escrow: string | number;
}

export interface YearSummary {
  year: number;
  count: number;
  payment: number;
  principal: number;
  interest: number;
  escrow: number;
  fees: number;
  endBalance: number | null;
  partial: boolean;
  interestShare: number;
}

export type Metric = "interest" | "principal" | "payment" | "escrow";

export interface Pivot {
  years: number[];
  months: string[];
  cells: number[][];
  totals: number[];
  max: number;
}

export interface DeductionInput {
  interest: number;
  avgBalance: number | null;
  filing: "single" | "mfj";
  officeSqft: number | string;
  homeSqft: number | string;
  otherItemized: number | string;
  grandfathered: boolean;
  marginalRate: number;
  reported1098: string;
}

export interface Deduction {
  interest: number;
  limit: number;
  limitRatio: number;
  capped: boolean;
  allowed: number;
  officePct: number;
  business: number;
  personal: number;
  standard: number;
  other: number;
  itemized: number;
  itemize: boolean;
  shortOfStandard: number;
  businessSaved: number;
  personalSaved: number;
  totalSaved: number;
  diff: number | null;
  matches: boolean;
}

interface Api {
  MONTHS: string[];
  readMortgage(text: string): ReadResult;
  paymentsFromTransactions(txns: { date: string; name: string; amount: number }[]): Payment[];
  estimate(rows: Payment[], terms: Terms): { rows: Payment[]; ok: boolean };
  byYear(rows: Payment[]): YearSummary[];
  monthly(rows: Payment[], year: number): Record<"interest" | "principal" | "escrow" | "payment", number[]>;
  pivot(rows: Payment[], metric: Metric): Pivot;
  averageBalance(rows: Payment[], year: number): number | null;
  deduction(input: Partial<DeductionInput> & { interest: number }): Deduction;
}

export const mortgage = core as unknown as Api;

export const MORTGAGE_KEYS = { data: "mortgage.data.v1", settings: "mortgage.settings.v1" };

/** What the Mortgage tab saved: its file's payments, with interest estimated from the loan details when the file has none. */
export function loadMortgage(): { label: string; rows: Payment[]; estimated: boolean } | null {
  try {
    const raw = scopedStorage.getItem(MORTGAGE_KEYS.data);
    if (!raw) return null;
    const src = JSON.parse(raw) as { label: string; text: string };
    const read = mortgage.readMortgage(src.text);
    if (!read.rows.length) return null;
    if (read.hasInterest) return { label: src.label, rows: read.rows, estimated: false };
    const s = scopedStorage.getItem(MORTGAGE_KEYS.settings);
    const est = mortgage.estimate(read.rows, (s ? JSON.parse(s).terms : {}) as Terms);
    return est.ok ? { label: src.label, rows: est.rows, estimated: true } : null;
  } catch {
    return null;
  }
}
