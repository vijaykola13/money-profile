import * as React from "react";
import {
  Banknote,
  Car,
  CircleDot,
  CreditCard,
  Film,
  Home,
  MoreHorizontal,
  Repeat,
  Search,
  Shield,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Utensils,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Model } from "@/lib/model";
import { Card, StatusPill, usd } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  Salary: Banknote,
  Rent: Home,
  Groceries: ShoppingCart,
  Dining: Utensils,
  Transport: Car,
  Entertainment: Film,
  Shopping: ShoppingBag,
  Subscriptions: Repeat,
  Utilities: Zap,
  Insurance: Shield,
  "Car payment": CreditCard,
  "Debt payment": CreditCard,
};

const FILTERS = ["All", "Income", "Expense"] as const;
const PAGE = 8;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function ActivityTable({ model }: { model: Model }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [shown, setShown] = React.useState(PAGE);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [menu, setMenu] = React.useState<string | null>(null);

  const rows = model.activities.filter(
    (a) =>
      (filter === "All" || a.type === filter.toLowerCase()) &&
      (a.name + a.category + a.id).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const visible = rows.slice(0, shown);
  const key = (a: (typeof rows)[number], i: number) => `${a.id}-${i}`;
  const allPicked = visible.length > 0 && visible.every((a, i) => picked.has(key(a, i)));

  const toggle = (k: string) =>
    setPicked((s) => {
      const next = new Set(s);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  return (
    <Card className="min-w-0 lg:col-span-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">Recent Activities</h3>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 focus-within:ring-2 focus-within:ring-brand/40">
            <Search className="size-4" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activity"
              aria-label="Search activity"
              className="w-36 bg-transparent text-ink outline-none placeholder:text-gray-400"
            />
          </label>
          <button
            type="button"
            onClick={() => setFilter(FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length])}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand"
            aria-label={`Filter: ${filter}. Click to change`}
          >
            <SlidersHorizontal className="size-4" /> {filter}
          </button>
        </div>
      </div>

      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[640px] text-left text-sm font-medium">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-400">
              <th className="w-8 pb-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map(key)))}
                  className="size-4 accent-[#2E9A58]"
                />
              </th>
              <th className="pb-3 font-semibold">Order ID</th>
              <th className="pb-3 font-semibold">Activity</th>
              <th className="pb-3 font-semibold">Price</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 font-semibold">Date</th>
              <th className="w-8 pb-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((a, i) => {
              const k = key(a, i);
              const Icon = ICONS[a.category] ?? CircleDot;
              return (
                <tr key={k} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                  <td className="py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${a.name}`}
                      checked={picked.has(k)}
                      onChange={() => toggle(k)}
                      className="size-4 accent-[#2E9A58]"
                    />
                  </td>
                  <td className="py-3 text-ink">#{a.id}</td>
                  <td className="py-3">
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-500">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="max-w-[170px] truncate text-ink" title={a.name}>
                        {a.name}
                      </span>
                    </span>
                  </td>
                  <td className={`py-3 font-bold ${a.type === "income" ? "text-emerald-500" : "text-ink"}`}>
                    {a.type === "income" ? "+" : "−"}
                    {usd(a.amount, a.amount % 1 ? 2 : 0)}
                  </td>
                  <td className="py-3">
                    <StatusPill status={a.status} />
                  </td>
                  <td className="whitespace-nowrap py-3 text-gray-500">{fmtDate(a.date)}</td>
                  <td className="relative py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Actions for ${a.name}`}
                      aria-expanded={menu === k}
                      onClick={() => setMenu(menu === k ? null : k)}
                      className="grid size-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                    {menu === k && (
                      <div className="absolute right-0 top-10 z-10 w-36 rounded-2xl bg-white p-1 text-left shadow-card ring-1 ring-gray-100">
                        <button
                          type="button"
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-ink hover:bg-gray-50"
                          onClick={() => {
                            void navigator.clipboard?.writeText(a.id);
                            setMenu(null);
                          }}
                        >
                          Copy ID
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-400">
                  No activity matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > shown && (
        <button
          type="button"
          onClick={() => setShown((s) => s + PAGE)}
          className="mt-3 w-full rounded-2xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand"
        >
          Show more ({rows.length - shown} left)
        </button>
      )}
    </Card>
  );
}
