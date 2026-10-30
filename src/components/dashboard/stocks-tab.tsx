import * as React from "react";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { engine } from "@/lib/engine";
import type { Bar, StockData } from "@/lib/stocks";
import { smooth } from "./income-chart";
import { Card, CardTitle, pct, usd } from "./ui";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const px = (n: number) => usd(n, 2);
const signed = (n: number, f: (x: number) => string) => (n >= 0 ? "+" : "−") + f(Math.abs(n));
const tone = (n: number) => (n >= 0 ? "text-emerald-500" : "text-red-500");
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Summary({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 truncate text-3xl font-bold tracking-tight text-ink">{value}</p>
      {sub && <p className={`mt-1 text-xs font-semibold ${subTone ?? "text-gray-400"}`}>{sub}</p>}
    </Card>
  );
}

function PriceChart({ bars, trades, symbol }: { bars: Bar[]; trades: StockData["trades"]; symbol: string }) {
  const closes = bars.map((b) => b.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const pad = (hi - lo) * 0.1 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const x = (i: number) => (i / Math.max(1, bars.length - 1)) * 100;
  const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
  const pts = bars.map((b, i) => [x(i), y(b.close)] as [number, number]);
  const ticks = [0, 1, 2, 3, 4].map((i) => min + ((max - min) * (i + 0.5)) / 5);
  const up = closes[closes.length - 1] >= closes[0];
  const color = up ? "#10b981" : "#ef4444";
  const labelAt = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (bars.length - 1)));

  return (
    <div className="mt-4 flex">
      <div className="relative mr-3 h-64 w-12 shrink-0 text-right text-[10px] text-gray-400" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>
            ${t.toFixed(t < 100 ? 1 : 0)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-64">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-gray-100" style={{ top: `${y(t)}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label={`${symbol} price, last year`}>
            <defs>
              <linearGradient id="stock-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.18" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${smooth(pts)}L100,100L0,100Z`} fill="url(#stock-fill)" />
            <path d={smooth(pts)} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {trades.map((t, i) => (
            <button
              type="button"
              key={`${t.day}-${i}`}
              title={`${t.side} ${t.shares} on ${fmtDate(bars[t.day].date)} at ${px(bars[t.day].close)}`}
              aria-label={`${t.side} ${t.shares} shares on ${fmtDate(bars[t.day].date)}`}
              className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform hover:scale-150 focus-visible:scale-150 focus-visible:outline-2 focus-visible:outline-brand ${
                t.side === "buy" ? "bg-emerald-500" : "bg-red-500"
              }`}
              style={{ left: `${x(t.day)}%`, top: `${y(bars[t.day].close)}%` }}
            />
          ))}
        </div>
        <div className="relative mt-2 h-4 text-[10px] text-gray-400" aria-hidden="true">
          {labelAt.map((i) => (
            <span
              key={i}
              className={`absolute whitespace-nowrap ${i === 0 ? "" : i === bars.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${x(i)}%` }}
            >
              {new Date(bars[i].date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
            </span>
          ))}
        </div>
        <p className="mt-3 flex gap-4 text-xs font-medium text-gray-400">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> Buy</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" /> Sell</span>
        </p>
      </div>
    </div>
  );
}

export function StocksTab({
  stocks,
  loading,
  error,
  onSymbol,
}: {
  stocks: StockData;
  loading: boolean;
  error: string;
  onSymbol: (s: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const { bars, symbol, positions, orders, trades, account } = stocks;

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] ?? last;
  const closes = bars.map((b) => b.close);
  const ma50 = closes.slice(-50).reduce((s, v) => s + v, 0) / Math.min(50, closes.length);
  const high52 = Math.max(...bars.map((b) => b.high ?? b.close));
  const low52 = Math.min(...bars.map((b) => b.low ?? b.close));
  const peak = Math.max(...closes);
  const day = last.close / prev.close - 1;
  const events = engine.detectPanic(bars, trades).filter((e) => e.flagged);

  const holdings = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalPl = positions.reduce((s, p) => s + p.pl, 0);
  const equity = account?.equity ?? holdings;
  const dayChange = account?.equity != null && account.lastEquity ? account.equity - account.lastEquity : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = query.trim().toUpperCase();
    if (/^[A-Z.]{1,6}$/.test(s)) onSymbol(s);
  };

  const stat = (k: string, v: string) => (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{k}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{v}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
        <Summary label="Portfolio value" value={usd(equity, 2)} sub={dayChange != null ? `${signed(dayChange, (n) => usd(n, 2))} today` : undefined} subTone={dayChange != null ? tone(dayChange) : undefined} />
        <Summary label="Unrealized P/L" value={signed(totalPl, (n) => usd(n, 2))} sub={`${positions.length} position${positions.length === 1 ? "" : "s"}`} subTone={tone(totalPl)} />
        <Summary label="Cash" value={account?.cash != null ? usd(account.cash, 2) : "—"} sub={account ? undefined : "Connect a brokerage"} />
        <Summary label="Buying power" value={account?.buyingPower != null ? usd(account.buyingPower, 2) : "—"} sub={account ? undefined : "Connect a brokerage"} />
      </div>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <CardTitle hint={stocks.live ? "Your open positions. Click a row for details." : "Sample portfolio. Connect Alpaca to see your own."}>Holdings</CardTitle>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[680px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                {["Symbol", "Qty", "Avg entry", "Price", "Market value", "Unrealized P/L", "Today"].map((h) => (
                  <th key={h} className="pb-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr
                  key={p.symbol}
                  tabIndex={0}
                  onClick={() => stocks.live && onSymbol(p.symbol)}
                  onKeyDown={(e) => e.key === "Enter" && stocks.live && onSymbol(p.symbol)}
                  className={`border-t border-gray-100 transition-colors hover:bg-[#F9FAFB] focus-visible:outline-2 focus-visible:outline-brand ${stocks.live ? "cursor-pointer" : ""} ${p.symbol === symbol ? "bg-orange-50/50" : ""}`}
                >
                  <td className="py-3 font-bold text-ink">{p.symbol}</td>
                  <td className="py-3 text-ink">{p.qty}</td>
                  <td className="py-3 text-ink">{px(p.avgEntry)}</td>
                  <td className="py-3 text-ink">{px(p.price)}</td>
                  <td className="py-3 font-bold text-ink">{px(p.marketValue)}</td>
                  <td className={`py-3 font-bold ${tone(p.pl)}`}>{signed(p.pl, px)} ({signed(p.plPct * 100, (n) => pct(n))})</td>
                  <td className={`py-3 font-semibold ${tone(p.dayPct)}`}>{signed(p.dayPct * 100, (n) => pct(n, 2))}</td>
                </tr>
              ))}
              {!positions.length && (
                <tr><td colSpan={7} className="py-10 text-center text-gray-400">No open positions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-bold text-ink">{symbol}</h3>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${day >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                {day >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {signed(day * 100, (n) => pct(n, 2))}
              </span>
            </div>
            <p className="mt-1 text-3xl font-bold tracking-tight text-ink">{px(last.close)}</p>
            <p className="mt-0.5 text-xs font-medium text-gray-400">Last close, {fmtDate(last.date)}</p>
          </div>
          <form onSubmit={submit} className="flex gap-2" role="search">
            <label className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 focus-within:ring-2 focus-within:ring-brand/40">
              <Search className="size-4" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={stocks.live ? "Look up a symbol" : "Needs Alpaca"}
                disabled={!stocks.live}
                aria-label="Look up a stock symbol"
                maxLength={6}
                className="w-32 bg-transparent uppercase text-ink outline-none placeholder:normal-case placeholder:text-gray-400"
              />
            </label>
            <button
              type="submit"
              disabled={!stocks.live}
              className="rounded-2xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Go
            </button>
          </form>
        </div>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-500">{error}</p>}
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
          <PriceChart bars={bars} trades={trades} symbol={symbol} />
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-4 md:col-span-2 lg:col-span-4">
        <Card>
          <CardTitle hint="From the last year of daily prices">Stock details</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            {stat("Last", px(last.close))}
            {stat("Open", last.open != null ? px(last.open) : "—")}
            {stat("Day high", last.high != null ? px(last.high) : "—")}
            {stat("Day low", last.low != null ? px(last.low) : "—")}
            {stat("Volume", last.volume != null ? compact.format(last.volume) : "—")}
            {stat("50-day avg", px(ma50))}
            {stat("52-wk high", px(high52))}
            {stat("52-wk low", px(low52))}
            {stat("From peak", pct((last.close / peak - 1) * 100))}
            {stat("Trend", last.close >= ma50 ? "Above 50-day" : "Below 50-day")}
          </div>
        </Card>
        <Card>
          <CardTitle hint={stocks.live ? `From your ${symbol} orders` : "Sample portfolio"}>Panic-sell check</CardTitle>
          {events.length ? (
            events.map((e) => (
              <div key={e.date} className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-3 text-sm font-medium text-ink">
                <strong>Panic-sell pattern on {e.date}.</strong> Sold {pct(e.soldFraction * 100)} of the position while the price was{" "}
                {pct(e.drawdown * 100)} below its recent peak. Holding would be worth {usd(e.heldValue)} versus {usd(e.proceeds)} received.
              </div>
            ))
          ) : (
            <div className="rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm font-medium text-ink">
              {trades.length ? "No panic-sell pattern detected." : `No ${symbol} orders to check.`}
            </div>
          )}
        </Card>
      </div>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <CardTitle hint={`Filled and closed ${symbol} orders`}>Order history</CardTitle>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                {["Date", "Side", "Qty", "Price", "Type", "Status"].map((h) => (
                  <th key={h} className="pb-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 12).map((o, i) => (
                <tr key={i} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                  <td className="py-3 text-gray-500">{fmtDate(o.date)}</td>
                  <td className="py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${o.side === "buy" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{o.side}</span>
                  </td>
                  <td className="py-3 text-ink">{o.qty}</td>
                  <td className="py-3 font-bold text-ink">{o.price != null ? px(o.price) : "—"}</td>
                  <td className="py-3 capitalize text-gray-500">{o.type}</td>
                  <td className="py-3 capitalize text-gray-500">{o.status.replace("_", " ")}</td>
                </tr>
              ))}
              {!orders.length && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">No orders for {symbol}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
