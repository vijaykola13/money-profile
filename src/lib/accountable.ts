import * as core from "../../js/accountable.mjs";

export type Bucket = "Home office" | "Company car" | "Medical";

export interface Plan {
  homeOffice: number;
  companyCar: number;
  medical: number;
  companyCarInsurers: string[];
  personalCarInsurers: string[];
}

export interface Row {
  id: number;
  date: string;
  name: string;
  amount: number;
  category: string;
  bucket: Bucket | null;
  eligible: boolean;
  /** Business-use percent, 0 to 100. */
  pct: number;
  reimbursable: number;
  reason: string;
  note: string;
  needsReview: boolean;
  edited?: boolean;
}

export interface ReadResult {
  transactions: { date: string; name: string; amount: number }[];
  skipped: { line: number; raw: string }[];
  mapping: { date: number; name: number; amount: number } | null;
  warnings: string[];
}

export interface Summary {
  total: number;
  eligibleCount: number;
  buckets: Record<Bucket, number>;
  needsReview: number;
}

export interface Score {
  rows: number;
  matched: number;
  missing: number;
  categoryOk: number;
  eligibilityOk: number;
  amountOk: number;
  mismatches: { date: string; name: string; expected: string; got: string }[];
}

export type Choice = Bucket | "Not eligible";

interface Api {
  DEFAULT_PLAN: Plan;
  readTransactions(text: string): ReadResult;
  classifyAll(transactions: ReadResult["transactions"], plan: Plan): Row[];
  applyOverride(row: Row, choice: Choice | null, plan: Plan): Row;
  summarize(rows: Row[]): Summary;
  scoreAgainstKey(rows: Row[], keyText: string): Score;
  toCsv(rows: Row[]): string;
}

export const accountable = core as unknown as Api;
