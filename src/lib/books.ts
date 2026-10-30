import * as books from "../../js/books.mjs";
import * as taxplan from "../../js/taxplan.mjs";
import * as forecast from "../../js/forecast.mjs";
import type { Row, Summary as PlanSummary } from "@/lib/accountable";
import type { TaxResult } from "@/lib/engine";
import type { Month, Summary as PotSummary } from "@/lib/paycheck";
import type { TagInfo, Tag } from "@/lib/importer";
import type { Tx } from "@/lib/dataset";

export type Learned = Record<string, Tag>;

export interface Quarter {
  id: string;
  covers: string;
  periodStart: string;
  periodEnd: string;
  due: string;
  amountDue: number;
  cumulativeRequired: number;
  setAside: number;
  gap: number;
  status: "No data yet" | "On track" | "Covered" | "Behind" | "Short";
}

export interface Monthly {
  months: string[];
  income: number[];
}

export interface BooksSummary {
  empty: false;
  span: { count: number; first: string; last: string; months: number };
  monthly: Monthly;
  totalIncome: number;
  totalSpending: number;
  incomeSwing: number;
  estimate: TaxResult;
  rate: number;
  recommended: number;
  pot: PotSummary;
  sim: Month[];
  forecast: { expectedIncome: number; leanIncome: number; expected: Month[]; lean: Month[] };
  tags: { business: number; personal: number; needsReview: number };
  plan: PlanSummary;
  planRows: Row[];
  tax: { taxYear: number; required: { amount: number; basis: string }; quarterly: Quarter[] };
}

interface BooksApi {
  summarizeBooks(
    txns: Tx[],
    options?: { learned?: Learned; today?: string; priorYearTax?: number },
  ): BooksSummary | { empty: true; span: { count: 0; first: null; last: null; months: 0 } };
  tagFor(txn: Tx, learned?: Learned): TagInfo;
}

interface TaxplanApi {
  quarters(taxYear: number): { id: string; covers: string; periodStart: string; periodEnd: string; due: string }[];
  requiredAnnual(args: { currentYearTax: number; priorYearTax?: number; priorAgiOver150k?: boolean }): { amount: number; basis: string };
  schedule(args: { taxYear: number; required: number; taxRate: number; monthly: Monthly; today: string }): Quarter[];
}

interface ForecastApi {
  projectPot(args: { history: number[]; paycheck: number; taxRate: number; startPot?: number; months?: number }): BooksSummary["forecast"];
}

export const booksApi = books as unknown as BooksApi;
export const taxplanApi = taxplan as unknown as TaxplanApi;
export const forecastApi = forecast as unknown as ForecastApi;

/** The books for a set of transactions, or null when there is nothing loaded. */
export function computeBooks(txns: Tx[], options?: { learned?: Learned; priorYearTax?: number }): BooksSummary | null {
  const out = booksApi.summarizeBooks(txns, { ...options, today: new Date().toISOString().slice(0, 10) });
  return out.empty ? null : out;
}
