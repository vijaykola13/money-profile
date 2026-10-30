import * as React from "react";
import type { Txn } from "@/lib/engine";

export interface Account {
  name: string;
  type: string;
  subtype: string | null;
  balance: number | null;
}

export interface PlaidPayload {
  configured: boolean;
  env?: string;
  error?: string;
  transactions?: Txn[];
  accounts?: Account[];
}

const DAY = 864e5;
const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Splits the transactions' date range into equal buckets of income and spending, in dollars. */
export function bucketSeries(txns: Txn[], buckets = 6) {
  const times = txns.map((t) => Date.parse(t.date));
  const start = Math.min(...times);
  const width = (Math.max(...times) - start + DAY) / buckets;
  const profit = Array<number>(buckets).fill(0);
  const loss = Array<number>(buckets).fill(0);
  for (const t of txns) {
    const i = Math.min(buckets - 1, Math.floor((Date.parse(t.date) - start) / width));
    (t.type === "income" ? profit : loss)[i] += t.amount;
  }
  return {
    labels: Array.from({ length: buckets }, (_, i) => fmtDay(start + i * width)),
    profit: profit.map(Math.round),
    loss: loss.map(Math.round),
  };
}

/** Months of history the transactions cover (at least one), for annualising income. */
export function monthsCovered(txns: Txn[]): number {
  const times = txns.map((t) => Date.parse(t.date));
  return Math.max(1, (Math.max(...times) - Math.min(...times) + DAY) / (30.4 * DAY));
}

export function useBankData() {
  const [plaid, setPlaid] = React.useState<PlaidPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/.netlify/functions/plaid")
      .then((r) => (r.ok ? (r.json() as Promise<PlaidPayload>) : null))
      .then((p) => {
        if (!cancelled && p?.configured && !p.error && p.transactions?.length) setPlaid(p);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { plaid, loading };
}
