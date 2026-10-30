// Typed access to the shared engine (js/engine.mjs, also used by the tests), tax config and sample data.
import * as core from "../../js/engine.mjs";
import TAX from "../../js/tax2025.mjs";
import demo from "../../data/demo.mjs";

export interface Txn {
  month: string;
  date: string;
  name: string;
  category: string;
  type: "income" | "expense";
  amount: number;
}

export interface Profile {
  income: number;
  spent: number;
  savingsRate: number;
  label: "Saver" | "Balanced" | "Stretched" | "Unknown";
  fixedShare: number;
  incomeVolatility: number;
  byCategory: Record<string, number>;
}

export interface TaxInput {
  filingStatus: "single" | "mfj";
  wages: number;
  selfEmployment?: number;
  otherIncome?: number;
  withholding?: number | null;
}

export interface TaxResult {
  agi: number;
  standardDeduction: number;
  taxable: number;
  incomeTax: number;
  seTax: number;
  total: number;
  ficaOnWages: number;
  effectiveRate: number;
  balance: number;
}

export interface Price {
  date: string;
  close: number;
}

export interface Trade {
  day: number;
  side: "buy" | "sell";
  shares: number;
}

export interface PanicEvent {
  date: string;
  drawdown: number;
  soldFraction: number;
  sold: number;
  proceeds: number;
  heldValue: number;
  regret: number;
  flagged: boolean;
}

interface EngineApi {
  profile(transactions: Txn[]): Profile;
  estimateTax(input: TaxInput, cfg: unknown): TaxResult;
  detectPanic(prices: Price[], trades: Trade[]): PanicEvent[];
}

interface DemoPersona {
  id: string;
  name: string;
  transactions: Omit<Txn, "date" | "name">[];
  trades: Trade[];
}

interface DemoData {
  ticker: string;
  prices: Price[];
  personas: DemoPersona[];
}

export const engine: EngineApi = core;
export const getTax = (): unknown => TAX;
export const getDemo = (): DemoData => demo;
