import { engine, getDemo, getTax, type Profile, type TaxResult, type Txn } from "@/lib/engine";
import { bucketSeries, monthsCovered, type Account, type PlaidPayload } from "@/lib/live-data";

export type Status = "Completed" | "Pending" | "In Progress";

export interface Activity {
  id: string;
  name: string;
  category: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  status: Status;
}

export interface Model {
  live: boolean;
  sourceLabel: string;
  balance: number;
  /** Shown under the balance: percent for sample data, net cash flow for linked data. */
  trend: { text: string; up: boolean };
  income: number;
  spending: number;
  incomeCount: number;
  profile: Profile;
  tax: TaxResult;
  months: number;
  monthlySpend: number;
  chart: { labels: string[]; profit: number[]; loss: number[] };
  activities: Activity[];
  accounts: Account[];
  transactions: Txn[];
}

const SAMPLE_BALANCE = 689372;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

function activities(txns: Txn[], sample: boolean): Activity[] {
  return txns
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 40)
    .map((t, i) => ({
      id: (t.id || `S${1000 + i}`).slice(-6).toUpperCase(),
      name: t.name || t.category,
      category: t.category,
      type: t.type,
      amount: t.amount,
      date: t.date,
      // Sample rows vary their status so the pills show; linked rows use what the bank reports.
      status: sample ? (i % 7 === 3 ? "In Progress" : i % 5 === 1 ? "Pending" : "Completed") : t.pending ? "Pending" : "Completed",
    }));
}

function derive(txns: Txn[], rest: Pick<Model, "live" | "sourceLabel" | "balance" | "trend" | "chart" | "accounts">, sample: boolean): Model {
  const profile = engine.profile(txns);
  const months = sample ? 12 : monthsCovered(txns);
  // Annualised from the history available; withholding is unknown, so this is tax before withholding.
  const tax = engine.estimateTax(
    { filingStatus: "single", wages: Math.round((profile.income / months) * 12), withholding: null },
    getTax(),
  );
  return {
    ...rest,
    income: profile.income,
    spending: profile.spent,
    incomeCount: txns.filter((t) => t.type === "income").length,
    profile,
    tax,
    months,
    monthlySpend: profile.spent / months,
    activities: activities(txns, sample),
    transactions: txns,
  };
}

export function buildModel(plaid: PlaidPayload | null): Model {
  if (plaid?.transactions?.length) {
    const txns = plaid.transactions;
    const accounts = plaid.accounts ?? [];
    const balance = accounts.filter((a) => a.type === "depository").reduce((s, a) => s + (a.balance ?? 0), 0);
    const income = txns.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const spent = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const net = income - spent;
    return derive(
      txns,
      {
        live: true,
        sourceLabel: `Linked bank · Plaid ${plaid.env ?? "sandbox"}`,
        balance,
        trend: {
          text: `${net >= 0 ? "+" : "−"}$${Math.abs(Math.round(net)).toLocaleString("en-US")} net cash flow`,
          up: net >= 0,
        },
        chart: bucketSeries(txns, 6),
        accounts,
      },
      false,
    );
  }

  const persona = getDemo().personas.find((p) => p.id === "casey")!;
  const txns: Txn[] = persona.transactions.map((t, i) => ({
    ...t,
    date: `${t.month}-${String(1 + ((i * 7) % 27)).padStart(2, "0")}`,
    name: t.category,
    id: `S${1000 + i}`,
  }));
  const monthly = (type: Txn["type"], m: number) =>
    txns.filter((t) => t.type === type && t.month.endsWith(String(m + 1).padStart(2, "0"))).reduce((s, t) => s + t.amount, 0);
  return derive(
    txns,
    {
      live: false,
      sourceLabel: "Sample data",
      balance: SAMPLE_BALANCE,
      trend: { text: "+2.4% this month", up: true },
      chart: {
        labels: MONTH_NAMES,
        profit: MONTH_NAMES.map((_, m) => Math.round(monthly("income", m))),
        loss: MONTH_NAMES.map((_, m) => Math.round(monthly("expense", m))),
      },
      accounts: [
        { name: "Everyday spending", type: "credit", subtype: null, balance: null },
        { name: "Travel rewards", type: "credit", subtype: null, balance: null },
      ],
    },
    true,
  );
}

/** Percent change of the last value against the one before it; null when there is no baseline. */
export function pctChange(xs: number[]): number | null {
  const [prev, last] = xs.slice(-2);
  return prev ? ((last - prev) / prev) * 100 : null;
}
