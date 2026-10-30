import * as React from "react";
import { CalendarClock, Landmark, Scale, Wallet } from "lucide-react";
import { computeBooks, taxplanApi } from "@/lib/books";
import { useData } from "@/lib/data-store";
import { loadLearned } from "@/lib/importer";
import { ProgressBar } from "@/components/charts";
import { Card, CardTitle, pct, usd } from "./ui";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[$,\s]/g, "")));
const inputCls =
  "w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand";

const TONE: Record<string, string> = {
  "On track": "bg-emerald-50 text-emerald-600",
  Covered: "bg-emerald-50 text-emerald-600",
  Behind: "bg-orange-50 text-brand",
  Short: "bg-red-50 text-red-500",
  "No data yet": "bg-gray-100 text-gray-500",
};

function Stat({ title, value, sub, icon, accent = false }: { title: string; value: string; sub: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`flex flex-col justify-between rounded-[32px] p-5 shadow-card ${accent ? "bg-gradient-to-br from-orange-500 to-orange-400 text-white" : "bg-white text-ink"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${accent ? "text-white/85" : "text-gray-500"}`}>{title}</span>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${accent ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{icon}</span>
      </div>
      <p className="mt-6 truncate text-3xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-xs font-medium ${accent ? "text-white/85" : "text-gray-400"}`}>{sub}</p>
    </div>
  );
}

export function TaxPlanTab() {
  const data = useData();
  const [learned] = React.useState(loadLearned);
  const base = React.useMemo(() => computeBooks(data.source.transactions, { learned }), [data.source.transactions, learned]);

  const [rateText, setRateText] = React.useState("");
  const [priorText, setPriorText] = React.useState("");
  const [over150, setOver150] = React.useState(false);
  const [year, setYear] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (base) {
      setRateText(String(Math.round(base.rate * 100)));
      setYear(base.tax.taxYear);
    }
  }, [base]);

  if (!base) {
    return (
      <Card>
        <CardTitle hint="Load a bank statement on the Home tab first">Quarterly tax planner</CardTitle>
        <p className="text-sm font-medium text-gray-500">The planner needs your deposits to estimate tax and the set-aside.</p>
      </Card>
    );
  }

  const taxYear = year ?? base.tax.taxYear;
  const rate = Math.min(0.6, Math.max(0, (num(rateText) || 0) / 100));
  const prior = Number.isFinite(num(priorText)) ? Math.max(0, num(priorText)) : 0;
  const required = taxplanApi.requiredAnnual({ currentYearTax: base.estimate.total, priorYearTax: prior, priorAgiOver150k: over150 });
  const today = new Date().toISOString().slice(0, 10);
  const rows = taxplanApi.schedule({ taxYear, required: required.amount, taxRate: rate, monthly: base.monthly, today });
  const next = rows.find((q) => q.due >= today) ?? rows[rows.length - 1];
  const years = [...new Set([Number(base.span.first.slice(0, 4)), base.tax.taxYear, base.tax.taxYear + 1])].sort();
  const days = Math.round((Date.parse(next.due) - Date.parse(today)) / 864e5);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
        <Stat accent title="Estimated annual tax" value={usd(base.estimate.total)} sub={`${pct(base.estimate.effectiveRate * 100)} of income · includes self-employment tax`} icon={<Landmark className="size-5" />} />
        <Stat title="To pay across the year" value={usd(required.amount)} sub={required.basis} icon={<Scale className="size-5" />} />
        <Stat title="Per quarter" value={usd(required.amount / 4)} sub="Four equal payments" icon={<Wallet className="size-5" />} />
        <Stat title="Next due" value={fmtDate(next.due)} sub={days >= 0 ? `${days} day${days === 1 ? "" : "s"} from today · ${usd(next.amountDue)}` : `${-days} days ago · ${usd(next.amountDue)}`} icon={<CalendarClock className="size-5" />} />
      </div>

      <Card className="lg:col-span-4">
        <CardTitle hint="Adjust to match your situation">Planner settings</CardTitle>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-500">
            Tax year
            <select value={taxYear} onChange={(e) => setYear(Number(e.target.value))} className={`mt-1 ${inputCls}`}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-500">
            Set-aside rate (%)
            <input inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} className={`mt-1 ${inputCls}`} />
            <span className="mt-1 block text-xs text-gray-400">Suggested from your income: {Math.round(base.rate * 100)}%</span>
          </label>
          <label className="block text-sm font-medium text-gray-500">
            Last year&apos;s total tax ($, optional)
            <input inputMode="decimal" placeholder="e.g. 8,200" value={priorText} onChange={(e) => setPriorText(e.target.value)} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <input type="checkbox" checked={over150} onChange={(e) => setOver150(e.target.checked)} className="size-4 accent-[#FF6B35]" />
            Last year&apos;s income was over $150,000
          </label>
        </div>
      </Card>

      <Card className="min-w-0 lg:col-span-8">
        <CardTitle hint="What is due, and whether your set-aside has built enough by then">Quarterly payments, {taxYear}</CardTitle>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                {["Quarter", "Income period", "Due", "Payment", "Set aside by then", "Status"].map((h) => (
                  <th key={h} className="pb-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                  <td className="py-3 font-bold text-ink">{q.id}</td>
                  <td className="py-3 text-gray-500">{q.covers}</td>
                  <td className="whitespace-nowrap py-3 text-ink">{fmtDate(q.due)}</td>
                  <td className="py-3 font-bold text-ink">{usd(q.amountDue)}</td>
                  <td className="min-w-[170px] py-3 text-ink">
                    {q.status === "No data yet" ? (
                      "—"
                    ) : (
                      <>
                        {usd(q.setAside)} of {usd(q.cumulativeRequired)}
                        <div className="mt-1.5">
                          <ProgressBar value={q.setAside} max={q.cumulativeRequired} tone={q.gap > 0 ? "#EF4444" : "#10B981"} label={`${q.id} set-aside progress`} />
                        </div>
                      </>
                    )}
                  </td>
                  <td className="py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[q.status]}`}>
                      {q.status}{q.gap > 0 && q.status !== "No data yet" ? ` · ${usd(q.gap)}` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs font-medium text-gray-400">
          Federal estimated tax only; state tax is not included. Payments are due on the usual dates (moved to the next weekday); holidays, extensions
          and your own situation can change them. &quot;Set aside&quot; is your deposits times the set-aside rate. This is a planning estimate, not tax advice;
          confirm the amounts and dates with a CPA or irs.gov.
        </p>
      </Card>
    </div>
  );
}
