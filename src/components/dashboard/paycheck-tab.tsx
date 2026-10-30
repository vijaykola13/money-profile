import * as React from "react";
import { FileUp, FlaskConical, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { accountable } from "@/lib/accountable";
import { engine, getTax } from "@/lib/engine";
import { paycheck as P } from "@/lib/paycheck";
import { smooth } from "./income-chart";
import { Card, CardTitle, pct, usd } from "./ui";

const SAMPLE = "/samples/test_accountable_plan_usbank.csv";
const MAX_BYTES = 5 * 1024 * 1024;

interface Source {
  label: string;
  months: string[];
  income: number[];
}

const monthLabel = (m: string) =>
  new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[$,\s]/g, "")));

/** A tidy step so the five gridlines land on round numbers. */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}
const short = (v: number) => (v >= 1000 ? `$${Number.isInteger(v / 1000) ? v / 1000 : (v / 1000).toFixed(1)}k` : `$${v}`);

const inputCls =
  "w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand";

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-xs font-medium text-gray-400">{hint}</div>}
    </label>
  );
}

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

function SmoothingChart({ months, income, paycheckAmt, pots }: { months: string[]; income: number[]; paycheckAmt: number; pots: number[] }) {
  const step = niceStep(Math.max(...income, ...pots, paycheckAmt));
  const top = step * 5;
  const ticks = [5, 4, 3, 2, 1].map((i) => i * step);
  const n = months.length;
  const x = (i: number) => 4 + (i * 92) / Math.max(1, n - 1);
  const y = (v: number) => 100 - (Math.max(0, v) / top) * 100;
  const pts = (xs: number[]) => xs.map((v, i) => [x(i), y(v)] as [number, number]);
  const incomePts = pts(income);
  const potPts = pts(pots);
  const payPts = pts(months.map(() => paycheckAmt));

  return (
    <div className="mt-6 flex">
      <div className="relative mr-3 h-64 w-10 shrink-0 text-right text-[10px] text-gray-400" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>{short(t)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-64">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-gray-100" style={{ top: `${y(t)}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" role="img" aria-label="Monthly income, steady paycheck and holding pot balance">
            <path d={smooth(incomePts)} fill="none" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 2" vectorEffect="non-scaling-stroke" />
            <path d={smooth(potPts)} fill="none" stroke="#FF6B35" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={smooth(payPts)} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {[
            { P: incomePts, vals: income, color: "#18181b", name: "Income" },
            { P: potPts, vals: pots, color: "#FF6B35", name: "Pot" },
          ].flatMap(({ P: pp, vals, color, name }) =>
            pp.map(([px, py], i) => (
              <button
                type="button"
                key={`${name}-${i}`}
                aria-label={`${name} ${monthLabel(months[i])}: ${usd(vals[i])}`}
                title={`${name}, ${monthLabel(months[i])}: ${usd(vals[i])}`}
                className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-transform hover:scale-150 focus-visible:scale-150 focus-visible:outline-2 focus-visible:outline-brand"
                style={{ left: `${px}%`, top: `${py}%`, backgroundColor: color }}
              />
            )),
          )}
        </div>
        <div className="relative mt-2 h-4 text-[10px] text-gray-400" aria-hidden="true">
          {months.map((m, i) => (
            <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(i)}%` }}>{monthLabel(m)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PaycheckTab() {
  const demo = P.DEMO_IRREGULAR;
  const [source, setSource] = React.useState<Source>({ label: "Demo: irregular freelance income", months: demo.months, income: demo.income });
  const [ratePct, setRatePct] = React.useState("25");
  const [potText, setPotText] = React.useState("0");
  const [payText, setPayText] = React.useState("");
  const [error, setError] = React.useState("");

  const taxRate = Math.min(0.6, Math.max(0, (num(ratePct) || 0) / 100));
  const startPot = Number.isFinite(num(potText)) ? Math.max(0, num(potText)) : 0;

  const recommended = React.useMemo(() => P.maxSafePaycheck({ income: source.income, taxRate, startPot }), [source, taxRate, startPot]);

  // Start each new source on the recommended paycheck; after that the paycheck is the user's choice.
  React.useEffect(() => {
    setPayText(String(P.maxSafePaycheck({ income: source.income, taxRate: Math.min(0.6, Math.max(0, (num(ratePct) || 0) / 100)), startPot: 0 })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const paycheckAmt = Number.isFinite(num(payText)) ? Math.max(0, num(payText)) : 0;
  const rows = React.useMemo(() => P.simulate({ income: source.income, paycheck: paycheckAmt, taxRate, startPot }), [source, paycheckAmt, taxRate, startPot]);
  const sum = P.summarize(rows, paycheckAmt);
  const avgNet = rows.length ? rows.reduce((s, r) => s + r.net, 0) / rows.length : 0;

  const annual = source.months.length ? (sum.totalIncome / source.months.length) * 12 : 0;
  const estimate = React.useMemo(
    () => engine.estimateTax({ filingStatus: "single", wages: 0, selfEmployment: Math.round(annual), withholding: null }, getTax()),
    [annual],
  );
  const suggested = P.suggestRate(estimate.total, annual);
  const incomeSwing = P.swing(source.income);

  const fromBank = (text: string, label: string) => {
    const read = accountable.readTransactions(text);
    const classified = accountable.classifyAll(read.transactions, accountable.DEFAULT_PLAN);
    const incomeRows = classified.filter((r) => r.category === "Owner draw / income" || r.category === "Client payment");
    if (!incomeRows.length) return setError("No income deposits found in that file.");
    setError("");
    const by = P.incomeByMonth(incomeRows, classified.map((r) => r.date));
    setSource({ label, ...by });
  };

  const loadSample = async () => {
    try {
      const res = await fetch(SAMPLE);
      if (!res.ok) throw new Error("missing");
      fromBank(await res.text(), "Sample bank file: deposits only");
    } catch {
      setError("Couldn't load the sample file.");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Export a shorter date range.");
    fromBank(await file.text(), file.name);
  };

  const statusOk = sum.shortfalls === 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
        <Stat accent title="Steady paycheck" value={`${usd(paycheckAmt)} / mo`} sub={statusOk ? "Covered every month" : `Short in ${sum.shortfalls} month${sum.shortfalls === 1 ? "" : "s"}`} icon={<Wallet className="size-5" />} />
        <Stat title="Tax set-aside" value={usd(sum.totalSetAside)} sub={`${pct(taxRate * 100, 0)} of every deposit`} icon={<Landmark className="size-5" />} />
        <Stat title="Holding pot" value={usd(sum.endPot)} sub={`${sum.runwayMonths} months of paychecks · low ${usd(sum.minPot)}`} icon={<PiggyBank className="size-5" />} />
        <Stat title="Income swing" value={pct(incomeSwing * 100, 0)} sub="Month to month. Your paycheck: 0%" icon={<TrendingUp className="size-5" />} />
      </div>

      <Card className="lg:col-span-4">
        <CardTitle hint="Deposits feed the pot. The paycheck comes out each month end.">Settings</CardTitle>
        <div className="space-y-3">
          <Field
            label="Tax set-aside rate (%)"
            hint={
              <>
                Estimated federal tax with self-employment tax on your income: about {pct(estimate.effectiveRate * 100, 0)}.{" "}
                <button type="button" className="font-semibold text-brand underline" onClick={() => setRatePct(String(Math.round(suggested * 100)))}>
                  Use suggested {Math.round(suggested * 100)}%
                </button>
              </>
            }
          >
            <input inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Starting holding pot ($)">
            <input inputMode="decimal" value={potText} onChange={(e) => setPotText(e.target.value)} className={inputCls} />
          </Field>
          <Field
            label="Monthly paycheck ($)"
            hint={
              <>
                Average income after set-aside: {usd(avgNet)} a month. Highest paycheck this history could have paid with no short month: {usd(recommended)}.{" "}
                <button type="button" className="font-semibold text-brand underline" onClick={() => setPayText(String(recommended))}>
                  Use recommended
                </button>
              </>
            }
          >
            <input inputMode="decimal" value={payText} onChange={(e) => setPayText(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Card>

      <Card className="lg:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink">Income vs steady paycheck</h3>
            <p className="mt-0.5 text-sm font-medium text-gray-500">{source.label}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-zinc-950" /> Income</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-blue" /> Paycheck</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" /> Holding pot</span>
          </div>
        </div>
        <SmoothingChart months={source.months} income={source.income} paycheckAmt={paycheckAmt} pots={rows.map((r) => r.pot)} />
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
            <FileUp className="size-4" aria-hidden="true" /> Upload bank CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => void loadSample()} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Sample bank file
          </button>
          <button type="button" onClick={() => setSource({ label: "Demo: irregular freelance income", months: demo.months, income: demo.income })} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Demo: irregular income
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <CardTitle hint="Each month: deposits in, set-aside out, paycheck paid from the pot">Month by month</CardTitle>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[760px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                {["Month", "Income in", "Tax set-aside", "To holding pot", "Paycheck paid", "Pot balance", "Tax pot", "Status"].map((h) => (
                  <th key={h} className="pb-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={source.months[i]} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                  <td className="py-3 text-ink">{monthLabel(source.months[i])}</td>
                  <td className="py-3 text-ink">{usd(r.income, 2)}</td>
                  <td className="py-3 text-gray-500">{usd(r.setAside, 2)}</td>
                  <td className="py-3 text-gray-500">{usd(r.net, 2)}</td>
                  <td className="py-3 font-bold text-ink">{usd(r.paid, 2)}</td>
                  <td className="py-3 font-bold text-brand">{usd(r.pot, 2)}</td>
                  <td className="py-3 text-gray-500">{usd(r.taxPot, 2)}</td>
                  <td className="py-3">
                    {r.shortfall > 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-500">Short {usd(r.shortfall)}</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">Paid</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs font-medium text-gray-400">
          Based on past deposits, so a lean future can still run the pot dry. The set-aside rate is an estimate of federal income and self-employment tax,
          not tax advice; confirm it and your quarterly payments with a CPA.
        </p>
      </Card>
    </div>
  );
}
