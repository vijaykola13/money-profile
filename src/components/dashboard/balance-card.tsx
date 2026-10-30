import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown } from "lucide-react";
import type { Model } from "@/lib/model";
import { Card, Flag, usd } from "./ui";

export function BalanceCard({ model }: { model: Model }) {
  const [note, setNote] = React.useState("");
  const wallets = [
    { code: "USD" as const, symbol: "$", amount: model.balance, active: true },
    { code: "EUR" as const, symbol: "€", amount: 0, active: false },
    { code: "GBP" as const, symbol: "£", amount: 0, active: false },
  ];

  return (
    <Card className="flex flex-col lg:col-span-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">Total Balance</h3>
        <span
          title="Other currencies need a multi-currency account"
          className="inline-flex items-center gap-2 rounded-full bg-gray-100 py-1 pl-1.5 pr-2.5 text-sm font-semibold text-ink"
        >
          <Flag code="USD" size={20} />
          USD
          <ChevronDown className="size-4 text-gray-400" />
        </span>
      </div>

      <p className="mt-4 text-4xl font-bold tracking-tight text-ink">{usd(model.balance, 2)}</p>
      <p className={`mt-2 text-sm font-semibold ${model.trend.up ? "text-emerald-500" : "text-red-500"}`}>
        {model.trend.up ? "↑" : "↓"} {model.trend.text}
      </p>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => setNote("Transfers are not enabled in the sandbox.")}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ArrowUpRight className="size-4" /> Transfer
        </button>
        <button
          type="button"
          onClick={() => setNote("Requests are not enabled in the sandbox.")}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ArrowDownLeft className="size-4" /> Request
        </button>
      </div>
      <p className="mt-2 min-h-5 text-xs font-medium text-gray-400" role="status">
        {note}
      </p>

      <div className="mt-auto pt-4">
        <h4 className="mb-3 text-sm font-semibold text-ink">Wallets</h4>
        <div className="grid grid-cols-3 gap-3">
          {wallets.map((w) => (
            <div key={w.code} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <Flag code={w.code} size={22} />
              <p className="mt-2 truncate text-sm font-semibold text-ink">
                {w.symbol}
                {w.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  w.active ? "bg-emerald-50 text-emerald-600" : "bg-gray-200 text-gray-500"
                }`}
              >
                {w.active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
