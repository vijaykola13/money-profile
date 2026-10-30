import * as core from "../../js/paycheck.mjs";

export interface Month {
  income: number;
  setAside: number;
  net: number;
  paid: number;
  shortfall: number;
  pot: number;
  taxPot: number;
}

export interface Summary {
  totalIncome: number;
  totalSetAside: number;
  totalPaid: number;
  shortfalls: number;
  endPot: number;
  minPot: number;
  runwayMonths: number;
}

interface Api {
  incomeByMonth(income: { date: string; amount: number }[], allDates: string[]): { months: string[]; income: number[] };
  simulate(args: { income: number[]; paycheck: number; taxRate: number; startPot?: number }): Month[];
  maxSafePaycheck(args: { income: number[]; taxRate: number; startPot?: number }): number;
  swing(values: number[]): number;
  suggestRate(totalTax: number, annualIncome: number, buffer?: number): number;
  summarize(rows: Month[], paycheck: number): Summary;
  DEMO_IRREGULAR: { months: string[]; income: number[] };
}

export const paycheck = core as unknown as Api;
