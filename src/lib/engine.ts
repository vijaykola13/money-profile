// Bridges the shared engine (js/engine.js, also used by the tests) into typed TypeScript.
// The plain-JS files attach themselves to `window` when loaded in the browser.
import "../../js/engine.js";
import "../../js/tax2025.js";
import "../../data/demo.js";

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

declare global {
  interface Window {
    Engine: EngineApi;
    TAX2025: unknown;
    DEMO: DemoData;
  }
}

export const engine = window.Engine;
export const TAX2025 = window.TAX2025;
export const DEMO = window.DEMO;
