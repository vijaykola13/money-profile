import { Landmark, PiggyBank, Receipt, Wallet } from "lucide-react";
import type { Model } from "@/lib/model";
import { pctChange } from "@/lib/model";
import { pct, usd } from "./ui";

function Stat({
  title,
  value,
  trend,
  icon,
  accent = false,
}: {
  title: string;
  value: string;
  trend: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-between rounded-[32px] p-5 shadow-card ${
        accent ? "bg-gradient-to-br from-emerald-600 to-emerald-500 text-white" : "bg-white text-ink"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${accent ? "text-white/85" : "text-gray-500"}`}>{title}</span>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${accent ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
          {icon}
        </span>
      </div>
      <p className="mt-6 truncate text-3xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-xs font-medium ${accent ? "text-white/85" : "text-gray-400"}`}>{trend}</p>
    </div>
  );
}

export function StatsGrid({ model }: { model: Model }) {
  const incomeTrend = pctChange(model.chart.profit);
  const spendTrend = pctChange(model.chart.loss);
  const fmt = (c: number | null) => (c === null ? "No prior period" : `${c >= 0 ? "+" : ""}${c.toFixed(0)}% vs prior period`);

  return (
    <div className="grid grid-cols-2 gap-4 lg:col-span-3">
      <Stat accent title="Income" value={usd(model.income)} trend={fmt(incomeTrend)} icon={<Wallet className="size-5" />} />
      <Stat title="Spending" value={usd(model.spending)} trend={fmt(spendTrend)} icon={<Receipt className="size-5" />} />
      <Stat
        title="Savings"
        value={pct(model.profile.savingsRate * 100, 0)}
        trend={`${model.profile.label} profile`}
        icon={<PiggyBank className="size-5" />}
      />
      <Stat
        title="Est. tax"
        value={usd(model.tax.total)}
        trend={`${pct(model.tax.effectiveRate * 100)} effective rate`}
        icon={<Landmark className="size-5" />}
      />
    </div>
  );
}
