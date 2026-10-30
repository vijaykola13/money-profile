import * as React from "react";
import { AccountableTab } from "@/components/dashboard/accountable-tab";
import { ActivityTable } from "@/components/dashboard/activity-table";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { ConnectionsTab } from "@/components/dashboard/connections-tab";
import { HomeTab } from "@/components/dashboard/home-tab";
import { ImportTab } from "@/components/dashboard/import-tab";
import { IncomeChart } from "@/components/dashboard/income-chart";
import { InsightsRow } from "@/components/dashboard/insights-row";
import { PaycheckTab } from "@/components/dashboard/paycheck-tab";
import { QuickbooksTab } from "@/components/dashboard/quickbooks-tab";
import { ReconcileTab } from "@/components/dashboard/reconcile-tab";
import { ReportTab } from "@/components/dashboard/report-tab";
import { Sidebar } from "@/components/dashboard/spending-cards";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { StocksTab } from "@/components/dashboard/stocks-tab";
import { TaxPlanTab } from "@/components/dashboard/taxplan-tab";
import { useData, type Mode } from "@/lib/data-store";
import { buildModel } from "@/lib/model";
import { useStocks } from "@/lib/stocks";

// The freelancer journey is the front door. Live connections are an advanced option the user chooses.
const FILE_TABS = [
  { id: "home", label: "Home" },
  { id: "import", label: "Import" },
  { id: "reconcile", label: "Reconcile" },
  { id: "paycheck", label: "Paycheck" },
  { id: "taxplan", label: "Tax planner" },
  { id: "accountable", label: "Accountable plan" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "report", label: "Report" },
] as const;
const LIVE_TABS = [
  { id: "connections", label: "Connections" },
  { id: "overview", label: "Overview" },
  { id: "stocks", label: "Stocks" },
] as const;
type TabId = (typeof FILE_TABS)[number]["id"] | (typeof LIVE_TABS)[number]["id"];

const ALL: readonly { id: TabId; label: string }[] = [...FILE_TABS, ...LIVE_TABS];
const isLiveTab = (t: TabId) => LIVE_TABS.some((x) => x.id === t);
const fromHash = (): TabId => ALL.find((t) => `#${t.id}` === window.location.hash)?.id ?? "home";

const MODES: { id: Mode; title: string; body: string; badge?: string }[] = [
  { id: "files", title: "Upload files", body: "Use a bank CSV. Your file stays in this browser." },
  { id: "live", title: "Connect live", badge: "Advanced", body: "Link a bank and brokerage (sandbox preview) and run the same tools on live data." },
];

export default function App() {
  const data = useData();
  const live = data.mode === "live";
  const stocks = useStocks(live);
  const model = React.useMemo(() => buildModel(data.plaid), [data.plaid]);

  const [tab, setTab] = React.useState<TabId>(fromHash);
  const go = React.useCallback((t: TabId) => {
    window.location.hash = t === "home" ? "" : t;
    setTab(t);
  }, []);

  // Opening a live-only link (such as #stocks) turns live mode on, so old links keep working.
  const { setMode } = data;
  React.useEffect(() => {
    const onHash = () => {
      const t = fromHash();
      setTab(t);
      if (isLiveTab(t)) setMode("live");
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [setMode]);

  const chooseMode = (m: Mode) => {
    data.setMode(m);
    if (m === "files" && isLiveTab(tab)) go("home");
  };

  const tabs = live ? ALL : FILE_TABS;
  const dot = (state: "live" | "loading" | "sample" | "off") =>
    ({ live: "bg-emerald-500", loading: "animate-pulse bg-brand", sample: "bg-brand", off: "bg-gray-300" })[state];
  const src = data.source;
  const sourceChip = {
    state: src.kind === "live" ? "live" : src.kind === "none" ? "off" : src.kind === "sample" ? "sample" : "live",
    text: src.kind === "none" ? "No data loaded" : src.kind === "sample" ? "Sample data" : src.kind === "live" ? src.label : `File: ${src.label}`,
  } as const;
  const bankPending = live && data.bankLoading && src.kind !== "live";

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 font-sans text-ink print:bg-white print:py-2 sm:px-6">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-6 print:mb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Money Profile</h1>
              <p className="mt-1 text-sm font-medium text-gray-500">Reconcile your accounts, pay yourself a steady paycheck, and set tax aside.</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden" role="status">
              <span className="inline-flex max-w-[320px] items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card">
                <span className={`size-2 shrink-0 rounded-full ${dot(bankPending ? "loading" : sourceChip.state)}`} />
                <span className="truncate">{bankPending ? "Linking bank…" : sourceChip.text}</span>
              </span>
              {live && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card">
                  <span className={`size-2 rounded-full ${dot(stocks.data.live ? "live" : stocks.loading ? "loading" : "off")}`} />
                  {stocks.loading && !stocks.data.live ? "Loading brokerage…" : stocks.data.live ? stocks.data.sourceLabel : "Brokerage not connected"}
                </span>
              )}
            </div>
          </div>

          <fieldset className="mt-5 print:hidden">
            <legend className="mb-2 text-sm font-semibold text-gray-500">Where does your data come from?</legend>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Data source">
              {MODES.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-white p-4 shadow-card transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${
                    data.mode === m.id ? "border-brand" : "border-transparent hover:border-gray-200"
                  }`}
                >
                  <input type="radio" name="data-mode" value={m.id} checked={data.mode === m.id} onChange={() => chooseMode(m.id)} className="mt-1 size-4 accent-[#FF6B35]" />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {m.title}
                      {m.badge && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">{m.badge}</span>}
                    </span>
                    <span className="block text-xs font-medium text-gray-500">{m.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </header>

        <nav className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card print:hidden" role="tablist" aria-label="Sections">
          {tabs.map((t, i) => (
            <React.Fragment key={t.id}>
              {live && i === FILE_TABS.length && <span aria-hidden="true" className="mx-1 w-px shrink-0 self-stretch bg-gray-200" />}
              <button
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => go(t.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  tab === t.id ? "bg-zinc-950 text-white" : "text-gray-500 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            </React.Fragment>
          ))}
        </nav>

        <div role="tabpanel">
          {tab === "home" && <HomeTab go={(t) => go(t as TabId)} />}
          {tab === "import" && <ImportTab />}
          {tab === "reconcile" && <ReconcileTab />}
          {tab === "paycheck" && <PaycheckTab />}
          {tab === "taxplan" && <TaxPlanTab />}
          {tab === "accountable" && <AccountableTab />}
          {tab === "quickbooks" && <QuickbooksTab />}
          {tab === "report" && <ReportTab />}
          {tab === "connections" && <ConnectionsTab stocks={stocks} />}
          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
              <BalanceCard model={model} />
              <StatsGrid model={model} />
              <IncomeChart model={model} />
              <InsightsRow model={model} stock={stocks.data} />
              <Sidebar model={model} />
              <ActivityTable model={model} />
            </div>
          )}
          {tab === "stocks" && (
            <StocksTab stocks={stocks.data} loading={stocks.loading} error={stocks.error} notice={stocks.notice} onSymbol={stocks.setSymbol} />
          )}
        </div>

        <footer className="mt-8 text-xs font-medium text-gray-400">
          Estimates for information only; not tax, legal or investment advice.
        </footer>
      </div>
    </div>
  );
}
