import * as React from "react";
import { getDemo, type Trade } from "@/lib/engine";

export interface Bar {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avgEntry: number;
  price: number;
  marketValue: number;
  pl: number;
  /** Fractions: 0.05 is 5%. */
  plPct: number;
  dayPct: number;
}

export interface OrderRow {
  date: string;
  side: "buy" | "sell";
  qty: number;
  price: number | null;
  status: string;
  type: string;
}

export interface Account {
  equity: number | null;
  lastEquity: number | null;
  cash: number | null;
  buyingPower: number | null;
}

export interface StockData {
  live: boolean;
  sourceLabel: string;
  symbol: string;
  bars: Bar[];
  trades: Trade[];
  orders: OrderRow[];
  positions: Position[];
  account: Account | null;
}

interface AlpacaPayload extends Partial<StockData> {
  configured: boolean;
  env?: string;
  error?: string;
  provider?: string;
}

/** Shown until a brokerage is connected: the sample portfolio with its simulated price series. */
export function sampleStocks(): StockData {
  const demo = getDemo();
  const sample = demo.personas.find((p) => p.id === "casey")!;
  const bars: Bar[] = demo.prices.map((p) => ({ date: p.date, close: p.close }));
  const last = bars[bars.length - 1].close;
  const prev = bars[bars.length - 2].close;
  const qty = sample.trades.reduce((s, t) => s + (t.side === "buy" ? t.shares : -t.shares), 0);
  const entry = bars[0].close;
  return {
    live: false,
    sourceLabel: "Sample portfolio",
    symbol: demo.ticker,
    bars,
    trades: sample.trades,
    orders: sample.trades
      .map((t) => ({
        date: bars[t.day].date,
        side: t.side,
        qty: t.shares,
        price: bars[t.day].close,
        status: "filled",
        type: "market",
      }))
      .reverse(),
    positions: [
      {
        symbol: demo.ticker,
        qty,
        avgEntry: entry,
        price: last,
        marketValue: qty * last,
        pl: qty * (last - entry),
        plPct: last / entry - 1,
        dayPct: last / prev - 1,
      },
    ],
    account: null,
  };
}

/** Fetches the brokerage. Pass `enabled = false` to skip the network call (files mode). */
export function useStocks(enabled = true) {
  const [symbol, setSymbol] = React.useState<string | null>(null);
  const [data, setData] = React.useState<StockData>(() => sampleStocks());
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState("");
  /** Why the sample portfolio is showing instead of the brokerage, when it is. */
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setNotice("");
    fetch(`/.netlify/functions/alpaca${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ""}`)
      .then((r) => r.json() as Promise<AlpacaPayload>)
      .then((p) => {
        if (cancelled) return;
        if (!p.configured) {
          // Keep the sample portfolio, but say why.
          setNotice("Alpaca keys aren't set on this site (ALPACA_KEY_ID, ALPACA_SECRET), so the sample portfolio is shown.");
          return;
        }
        if (p.error || !p.bars?.length) {
          setError(p.error ?? `No price data for ${symbol}.`);
          return;
        }
        setData({
          live: true,
          sourceLabel: `Alpaca ${p.env ?? "paper"}`,
          symbol: p.symbol!,
          bars: p.bars,
          trades: p.trades ?? [],
          orders: (p.orders ?? []).slice().reverse(),
          positions: p.positions ?? [],
          account: p.account ?? null,
        });
      })
      .catch(() => !cancelled && setNotice("Couldn't reach the brokerage service, so the sample portfolio is shown."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, enabled]);

  return { data, loading, error, notice, symbol, setSymbol };
}
