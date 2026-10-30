import * as React from "react";
import { ActivityTable } from "@/components/dashboard/activity-table";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { IncomeChart } from "@/components/dashboard/income-chart";
import { InsightsRow } from "@/components/dashboard/insights-row";
import { Sidebar } from "@/components/dashboard/spending-cards";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { StocksTab } from "@/components/dashboard/stocks-tab";
import { useBankData } from "@/lib/live-data";
import { buildModel } from "@/lib/model";
import { useStocks } from "@/lib/stocks";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "stocks", label: "Stocks" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const fromHash = (): Tab => (window.location.hash === "#stocks" ? "stocks" : "overview");

export default function App() {
  const { plaid, loading } = useBankData();
  const stocks = useStocks();
  // Sample data shows first; linked data replaces it once each provider responds.
  const model = React.useMemo(() => buildModel(plaid), [plaid]);

  const [tab, setTab] = React.useState<Tab>(fromHash);
  React.useEffect(() => {
    const onHash = () => setTab(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (t: Tab) => {
    window.location.hash = t === "overview" ? "" : t;
    setTab(t);
  };

  const dot = (live: boolean, busy: boolean) => (live ? "bg-emerald-500" : busy ? "animate-pulse bg-brand" : "bg-gray-300");

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 font-sans text-ink sm:px-6">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm font-medium text-gray-500">Your balance, spending profile and tax estimate in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="status">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card">
              <span className={`size-2 rounded-full ${dot(model.live, loading)}`} />
              {loading && !model.live ? "Loading bank…" : model.sourceLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card">
              <span className={`size-2 rounded-full ${dot(stocks.data.live, stocks.loading)}`} />
              {stocks.loading && !stocks.data.live
                ? "Loading brokerage…"
                : stocks.data.live
                  ? stocks.data.sourceLabel
                  : stocks.error || stocks.notice
                    ? "Brokerage not connected"
                    : stocks.data.sourceLabel}
            </span>
          </div>
        </header>

        <nav className="mb-6 inline-flex gap-1 rounded-full bg-white p-1 shadow-card" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                tab === t.id ? "bg-zinc-950 text-white" : "text-gray-500 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12" role="tabpanel">
            <BalanceCard model={model} />
            <StatsGrid model={model} />
            <IncomeChart model={model} />
            <InsightsRow model={model} stock={stocks.data} />
            <Sidebar model={model} />
            <ActivityTable model={model} />
          </div>
        ) : (
          <div role="tabpanel">
            <StocksTab
              stocks={stocks.data}
              loading={stocks.loading}
              error={stocks.error}
              notice={stocks.notice}
              onSymbol={stocks.setSymbol}
            />
          </div>
        )}

        <footer className="mt-8 text-xs font-medium text-gray-400">
          Estimates for information only; not tax, legal or investment advice.
        </footer>
      </div>
    </div>
  );
}
