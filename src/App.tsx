import * as React from "react";
import { ActivityTable } from "@/components/dashboard/activity-table";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { IncomeChart } from "@/components/dashboard/income-chart";
import { InsightsRow } from "@/components/dashboard/insights-row";
import { Sidebar } from "@/components/dashboard/spending-cards";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { useBankData } from "@/lib/live-data";
import { buildModel } from "@/lib/model";

export default function App() {
  const { plaid, loading } = useBankData();
  // Sample data shows first; linked bank data replaces it once the bank responds.
  const model = React.useMemo(() => buildModel(plaid), [plaid]);

  return (
    <div className="min-h-screen bg-canvas px-4 py-8 font-sans text-ink sm:px-6">
      <div className="mx-auto max-w-[1320px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm font-medium text-gray-500">Your balance, spending profile and tax estimate in one place.</p>
          </div>
          <span
            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card"
            role="status"
          >
            <span className={`size-2 rounded-full ${model.live ? "bg-emerald-500" : loading ? "animate-pulse bg-brand" : "bg-gray-300"}`} />
            {loading && !model.live ? "Loading linked data…" : model.sourceLabel}
          </span>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
          <BalanceCard model={model} />
          <StatsGrid model={model} />
          <IncomeChart model={model} />
          <InsightsRow model={model} />
          <Sidebar model={model} />
          <ActivityTable model={model} />
        </div>

        <footer className="mt-8 text-xs font-medium text-gray-400">
          Estimates for information only; not tax, legal or investment advice.
        </footer>
      </div>
    </div>
  );
}
