import * as React from "react";
import { Pencil, Rss } from "lucide-react";
import type { Model } from "@/lib/model";
import { Card, CardTitle, usd } from "./ui";

const DEFAULT_LIMIT = 5000;

function SpendingLimit({ model }: { model: Model }) {
  const [limit, setLimit] = React.useState(DEFAULT_LIMIT);
  const [editing, setEditing] = React.useState(false);
  const spent = model.monthlySpend;
  const share = Math.min(100, (spent / limit) * 100);
  const over = spent > limit;

  return (
    <Card>
      <div className="flex items-start justify-between">
        <CardTitle hint="Average per month, from your spending">Monthly Spending Limit</CardTitle>
        <button
          type="button"
          aria-label="Edit spending limit"
          onClick={() => setEditing((e) => !e)}
          className="grid size-9 place-items-center rounded-xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      <div className="flex items-baseline justify-between text-sm font-medium">
        <span className="text-xl font-bold text-ink">{usd(spent)}</span>
        {editing ? (
          <label className="flex items-center gap-1 text-gray-500">
            limit $
            <input
              type="number"
              min={100}
              step={100}
              value={limit}
              onChange={(e) => setLimit(Math.max(100, Number(e.target.value) || DEFAULT_LIMIT))}
              className="w-24 rounded-lg border-2 border-gray-200 px-2 py-1 text-ink"
            />
          </label>
        ) : (
          <span className="text-gray-500">of {usd(limit)}</span>
        )}
      </div>

      <div
        className="mt-3 h-4 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={Math.round(share)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Spending against limit"
      >
        <div
          className={`progress-stripe h-full rounded-full transition-[width] duration-700 ${over ? "bg-red-500" : "bg-[#2E9A58]"}`}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className={`mt-2 text-xs font-medium ${over ? "text-red-500" : "text-gray-400"}`}>
        {over ? `Over the limit by ${usd(spent - limit)}` : `${usd(limit - spent)} left this month`}
      </p>
    </Card>
  );
}

function BankCard({ name, balance, tone }: { name: string; balance: number | null; tone: "dark" | "green" }) {
  return (
    <div
      className={`relative flex h-[170px] w-[280px] shrink-0 snap-start flex-col justify-between rounded-3xl p-5 text-white shadow-card ${
        tone === "dark" ? "bg-[#18181b]" : "bg-gradient-to-br from-emerald-600 to-emerald-500"
      }`}
    >
      <div className="flex items-center justify-between">
        <Rss className="size-5 rotate-45 opacity-80" aria-hidden="true" />
        <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold tracking-wider backdrop-blur-md">ACTIVE</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex" aria-hidden="true">
          <span className="size-7 rounded-full bg-red-500" />
          <span className="-ml-3 size-7 rounded-full bg-emerald-300/90" />
        </div>
        <div className="text-right">
          <p className="max-w-[140px] truncate text-xs font-medium opacity-70">{name}</p>
          {balance !== null && <p className="text-sm font-semibold">{usd(balance)}</p>}
        </div>
      </div>

      <div>
        <p className="font-mono text-sm tracking-[0.2em]">**** **** **** ****</p>
        <div className="mt-1 flex gap-6 text-[10px] font-medium uppercase tracking-wider opacity-40">
          <span>Exp **/**</span>
          <span>CVV ***</span>
        </div>
      </div>
    </div>
  );
}

function MyCards({ model }: { model: Model }) {
  const cards = model.accounts.filter((a) => a.type === "depository" || a.type === "credit").slice(0, 4);
  return (
    <Card>
      <CardTitle hint={model.live ? "Accounts linked through Plaid" : "Sample cards"}>My Cards</CardTitle>
      <div className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2" tabIndex={0} aria-label="Cards">
        {cards.length ? (
          cards.map((a, i) => <BankCard key={a.name + i} name={a.name} balance={a.balance} tone={i % 2 ? "green" : "dark"} />)
        ) : (
          <p className="text-sm font-medium text-gray-400">No cards linked yet.</p>
        )}
      </div>
    </Card>
  );
}

export function Sidebar({ model }: { model: Model }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
      <SpendingLimit model={model} />
      <MyCards model={model} />
    </div>
  );
}
