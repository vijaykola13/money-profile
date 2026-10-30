import { apiFetch } from "@/lib/auth";
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

/** Fetches the linked bank. Pass `enabled = false` to skip the network call (files mode). */
export function useBankData(enabled = true) {
  const [plaid, setPlaid] = React.useState<PlaidPayload | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [status, setStatus] = React.useState<"off" | "loading" | "connected" | "not-configured" | "error">(enabled ? "loading" : "off");
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    if (!enabled) {
      setPlaid(null);
      setMessage("");
      setStatus("off");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStatus("loading");
    apiFetch("/.netlify/functions/plaid")
      .then((r) => (r.ok ? (r.json() as Promise<PlaidPayload>) : null))
      .then((p) => {
        if (cancelled) return;
        if (!p) return setStatus("error"), setMessage("The bank service could not be reached.");
        if (!p.configured) return setStatus("not-configured");
        if (p.error || !p.transactions?.length) return setStatus("error"), setMessage(p.error ?? "The bank returned no transactions.");
        setPlaid(p);
        setStatus("connected");
      })
      .catch(() => !cancelled && (setStatus("error"), setMessage("The bank service could not be reached.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { plaid, loading, status, message };
}
