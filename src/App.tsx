import * as React from "react";
import { Moon, Sun, X } from "lucide-react";
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
import { AccountMenu } from "@/components/dashboard/google-controls";
import { Card } from "@/components/dashboard/ui";
import { useData, type Mode } from "@/lib/data-store";
import { buildModel } from "@/lib/model";
import { useStocks } from "@/lib/stocks";
import { useTheme } from "@/lib/theme";

type TabId =
  | "home" | "import" | "reconcile" | "paycheck" | "taxplan" | "accountable" | "quickbooks" | "report"
  | "overview" | "stocks" | "connections";

// The freelancer journey is the front door. These tabs run on an uploaded statement.
const FILE_TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "import", label: "Import" },
  { id: "reconcile", label: "Reconcile" },
  { id: "paycheck", label: "Paycheck" },
  { id: "taxplan", label: "Tax planner" },
  { id: "accountable", label: "Accountable plan" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "report", label: "Report" },
];

// Live mode shows only what linked accounts can support, and every one of these runs on live data alone.
const LIVE_TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "stocks", label: "Stocks" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "connections", label: "Connections" },
];

const LIVE_ONLY: TabId[] = ["overview", "stocks", "connections"];
const KNOWN = new Set<TabId>([...FILE_TABS, ...LIVE_TABS].map((t) => t.id));

const home = (live: boolean): TabId => (live ? "overview" : "home");

/** Which tab and mode a URL hash means. A live-only link (such as #stocks) turns live mode on. */
function resolve(hash: string, liveNow: boolean): { tab: TabId; live: boolean } {
  const id = hash.replace(/^#/, "") as TabId;
  const known = KNOWN.has(id);
  const live = (known && LIVE_ONLY.includes(id)) || liveNow;
  const allowed = known && (live ? LIVE_TABS : FILE_TABS).some((t) => t.id === id);
  return { tab: allowed ? id : home(live), live };
}

const MODES: { id: Mode; title: string; body: string; badge?: string }[] = [
  { id: "files", title: "Upload files", body: "Use a bank CSV. Your file stays in this browser." },
  { id: "live", title: "Connect live", badge: "Advanced", body: "Link a bank and brokerage (sandbox preview). Shows only what live data can support." },
];

function LiveNotice({ title, body, onConnections }: { title: string; body: string; onConnections: () => void }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm font-medium text-gray-500">{body}</p>
      <button
        type="button"
        onClick={onConnections}
        className="mt-4 rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Open Connections
      </button>
    </Card>
  );
}

export default function App() {
  const data = useData();
  const theme = useTheme();
  const live = data.mode === "live";
  const stocks = useStocks(live);
  const model = React.useMemo(() => buildModel(data.plaid), [data.plaid]);

  const [tab, setTab] = React.useState<TabId>(() => resolve(window.location.hash, live).tab);
  const go = React.useCallback((t: TabId) => {
    window.location.hash = t === "home" ? "" : t;
    setTab(t);
  }, []);

  const liveRef = React.useRef(live);
  liveRef.current = live;
  const { setMode } = data;
  React.useEffect(() => {
    const onHash = () => {
      const r = resolve(window.location.hash, liveRef.current);
      if (r.live !== liveRef.current) setMode(r.live ? "live" : "files");
      setTab(r.tab);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [setMode]);

  const chooseMode = (m: Mode) => {
    data.setMode(m);
    const next = (m === "live" ? LIVE_TABS : FILE_TABS).some((t) => t.id === tab) ? tab : home(m === "live");
    go(next);
  };

  const { notice, dismissNotice } = data;
  React.useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(dismissNotice, 9000);
    return () => window.clearTimeout(id);
  }, [notice, dismissNotice]);

  const tabs = live ? LIVE_TABS : FILE_TABS;
  const dot = (state: "live" | "loading" | "sample" | "off") =>
    ({ live: "bg-emerald-500", loading: "animate-pulse bg-brand", sample: "bg-brand", off: "bg-gray-300" })[state];
  const src = data.source;
  const bankPending = live && data.bankStatus === "loading";
  const sourceChip: { state: "live" | "sample" | "off"; text: string } =
    live && src.kind !== "live"
      ? { state: "off", text: "Bank not connected" }
      : src.kind === "none"
        ? { state: "off", text: "No data loaded" }
        : src.kind === "sample"
          ? { state: "sample", text: "Sample data" }
          : { state: "live", text: src.kind === "live" ? src.label : `File: ${src.label}` };

  return (
    <div className="min-h-screen bg-canvas bg-[radial-gradient(ellipse_at_top_right,rgba(46,154,88,0.14),transparent_55%),radial-gradient(ellipse_at_top_left,rgba(42,115,179,0.12),transparent_50%)] px-4 py-8 font-sans text-ink transition-colors print:bg-white print:bg-none print:py-2 sm:px-6">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-6 print:mb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-4">
              <img src="/brand/logo-emblem.png" alt="CashPilot logo" width={64} height={64} className="size-16 shrink-0 drop-shadow-md" />
              <div>
                <h1 className="text-4xl font-extrabold leading-none tracking-tight text-logo-green">CashPilot</h1>
                <p className="mt-1.5 text-sm font-bold uppercase tracking-wide text-logo-blue">Your money. Your next move.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <AccountMenu />
              <button
                type="button"
                onClick={theme.toggle}
                aria-label={theme.dark ? "Switch to day mode" : "Switch to night mode"}
                title={theme.dark ? "Day mode" : "Night mode"}
                className="grid size-10 place-items-center rounded-full bg-white text-gray-500 shadow-card transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {theme.dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
              </button>
              <div className="flex flex-wrap gap-2" role="status">
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
                  <input type="radio" name="data-mode" value={m.id} checked={data.mode === m.id} onChange={() => chooseMode(m.id)} className="mt-1 size-4 accent-[#2E9A58]" />
                  <span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {m.title}
                      {m.badge && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-blue">{m.badge}</span>}
                    </span>
                    <span className="block text-xs font-medium text-gray-500">{m.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </header>

        {notice && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-brand-blue print:hidden">
            <span>{notice}</span>
            <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="shrink-0 rounded-lg p-0.5 hover:bg-blue-100/50 focus-visible:outline-2 focus-visible:outline-brand">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <nav className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card print:hidden" role="tablist" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
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
          ))}
        </nav>

        <div role="tabpanel" key={tab} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          {tab === "home" && <HomeTab go={(t) => go(t as TabId)} />}
          {tab === "import" && <ImportTab />}
          {tab === "reconcile" && <ReconcileTab />}
          {tab === "paycheck" && <PaycheckTab />}
          {tab === "taxplan" && <TaxPlanTab />}
          {tab === "accountable" && <AccountableTab />}
          {tab === "quickbooks" && <QuickbooksTab />}
          {tab === "report" && <ReportTab />}
          {tab === "connections" && <ConnectionsTab stocks={stocks} />}
          {tab === "overview" &&
            (data.bankStatus === "connected" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
                <BalanceCard model={model} />
                <StatsGrid model={model} />
                <IncomeChart model={model} />
                <InsightsRow model={model} stock={stocks.data.live ? stocks.data : null} />
                <Sidebar model={model} />
                <ActivityTable model={model} />
              </div>
            ) : (
              <LiveNotice
                title={data.bankStatus === "loading" ? "Linking your bank…" : "Bank not connected"}
                body={
                  data.bankStatus === "loading"
                    ? "This takes a few seconds."
                    : data.bankMessage || "Overview shows your linked bank's balance, income, spending and activity. Connect a bank to see it."
                }
                onConnections={() => go("connections")}
              />
            ))}
          {tab === "stocks" &&
            (stocks.data.live ? (
              <StocksTab stocks={stocks.data} loading={stocks.loading} error={stocks.error} notice={stocks.notice} onSymbol={stocks.setSymbol} />
            ) : (
              <LiveNotice
                title={stocks.loading ? "Loading your brokerage…" : "Brokerage not connected"}
                body={stocks.loading ? "This takes a few seconds." : stocks.error || stocks.notice || "Stocks shows your holdings, price charts and orders. Connect a brokerage to see them."}
                onConnections={() => go("connections")}
              />
            ))}
        </div>

        <footer className="mt-8 text-xs font-medium text-gray-400">
          Estimates for information only; not tax, legal or investment advice.
        </footer>
      </div>
    </div>
  );
}
