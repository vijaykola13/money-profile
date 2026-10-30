import * as React from "react";
import { CheckCircle2, FileUp, FlaskConical, House, Info, Trash2 } from "lucide-react";
import { logEvent } from "@/lib/audit";
import { useData } from "@/lib/data-store";
import { MORTGAGE_KEYS, mortgage, type Metric, type Terms } from "@/lib/mortgage";
import { scopedStorage } from "@/lib/storage";
import { BarsLine, Donut, ProgressBar, Sparkline } from "@/components/charts";
import { DriveImportButton } from "./google-controls";
import { Card, CardTitle, pct, usd } from "./ui";

const KEY_DATA = MORTGAGE_KEYS.data;
const KEY_SET = MORTGAGE_KEYS.settings;
const SAMPLE_FULL = "/samples/mortgage_payment_history.csv";
const SAMPLE_PAYMENTS = "/samples/mortgage_payments_only.csv";
const MAX_BYTES = 5 * 1024 * 1024;

const GREEN = "#2E9A58";
const BLUE = "#2A73B3";
const VIOLET = "#8B5CF6";

interface Source {
  label: string;
  text: string;
}

interface Settings {
  filing: "single" | "mfj";
  officeSqft: string;
  homeSqft: string;
  otherItemized: string;
  bracket: string;
  grandfathered: boolean;
  terms: { rate: string; balance: string; escrow: string };
  reported: Record<string, string>;
}

const DEFAULTS: Settings = {
  filing: "single",
  officeSqft: "",
  homeSqft: "",
  otherItemized: "",
  bracket: "24",
  grandfathered: false,
  terms: { rate: "", balance: "", escrow: "" },
  reported: {},
};

function load<T>(key: string): T | null {
  try {
    const raw = scopedStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) scopedStorage.removeItem(key);
    else scopedStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the data just won't be remembered */
  }
}

const inputCls =
  "w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand";
const btn =
  "inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand";

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-xs font-medium text-gray-400">{hint}</div>}
    </label>
  );
}

function Line({ k, v, strong = false, tone }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-2 text-sm font-medium last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className={`text-right ${strong ? "text-base font-bold" : "font-semibold"} ${tone ?? "text-ink"}`}>{v}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${
        active ? "bg-zinc-950 text-white" : "bg-gray-100 text-gray-500 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

const Estimate = () => (
  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600">Estimate</span>
);

const METRICS: { id: Metric; label: string }[] = [
  { id: "interest", label: "Interest" },
  { id: "principal", label: "Principal" },
  { id: "payment", label: "Total paid" },
  { id: "escrow", label: "Escrow & fees" },
];

const BRACKETS = ["10", "12", "22", "24", "32", "35", "37"];

export function MortgageTab() {
  const data = useData();
  const [source, setSource] = React.useState<Source | null>(() => load<Source>(KEY_DATA));
  const [settings, setSettings] = React.useState<Settings>(() => ({ ...DEFAULTS, ...load<Settings>(KEY_SET) }));
  const [year, setYear] = React.useState<number | null>(null);
  const [metric, setMetric] = React.useState<Metric>("interest");
  const [error, setError] = React.useState("");

  React.useEffect(() => save(KEY_SET, settings), [settings]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const setTerm = (k: keyof Settings["terms"], v: string) => setSettings((s) => ({ ...s, terms: { ...s.terms, [k]: v } }));

  const useSource = (next: Source | null, terms?: Settings["terms"]) => {
    setSource(next);
    save(KEY_DATA, next);
    setYear(null);
    setError("");
    if (terms) setSettings((s) => ({ ...s, terms }));
  };

  const onText = async (text: string, label: string) => {
    if (text.length > MAX_BYTES) return setError("That file is over 5 MB. Use a shorter date range.");
    const r = mortgage.readMortgage(text);
    if (!r.rows.length) return setError(r.warnings[0] ?? "No payments could be read from that file.");
    useSource({ label, text });
    logEvent("import", `Loaded ${r.rows.length} mortgage payments from ${label}`);
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Use a shorter date range.");
    await onText(await file.text(), file.name);
  };

  const loadSample = async (url: string, label: string, terms?: Settings["terms"]) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      useSource({ label, text: await res.text() }, terms);
    } catch {
      setError("Couldn't load the sample file.");
    }
  };

  // Mortgage debits found in a bank statement that is already loaded on the Home tab.
  const bankPayments = React.useMemo(() => mortgage.paymentsFromTransactions(data.source.transactions), [data.source.transactions]);
  const useBank = () => {
    const csv = "Date,Amount\n" + bankPayments.map((p) => `${p.date},${p.payment.toFixed(2)}`).join("\n") + "\n";
    useSource({ label: `${data.source.label} (mortgage payments)`, text: csv });
  };

  const clear = () => {
    useSource(null);
    setSettings(DEFAULTS);
    save(KEY_SET, null);
    logEvent("data", "Cleared the mortgage data");
  };

  const read = React.useMemo(() => (source ? mortgage.readMortgage(source.text) : null), [source]);
  const needsTerms = !!read && read.rows.length > 0 && !read.hasInterest;
  const est = React.useMemo(
    () => (needsTerms && read ? mortgage.estimate(read.rows, settings.terms as Terms) : null),
    [needsTerms, read, settings.terms],
  );
  const rows = read ? (read.hasInterest ? read.rows : est?.ok ? est.rows : []) : [];
  const estimated = !!est?.ok;

  const years = React.useMemo(() => mortgage.byYear(rows), [rows]);
  const y = year !== null && years.some((s) => s.year === year) ? year : years[years.length - 1]?.year;
  const sum = years.find((s) => s.year === y);
  const monthly = React.useMemo(() => (y ? mortgage.monthly(rows, y) : null), [rows, y]);
  const pivot = React.useMemo(() => mortgage.pivot(rows, metric), [rows, metric]);
  const pivotMin = React.useMemo(() => Math.min(Infinity, ...pivot.cells.flat().filter((v) => v > 0)), [pivot]);
  const balances = rows.filter((r) => r.balance !== null).map((r) => r.balance as number);

  const ded = React.useMemo(
    () =>
      sum
        ? mortgage.deduction({
            interest: sum.interest,
            avgBalance: mortgage.averageBalance(rows, sum.year),
            filing: settings.filing,
            officeSqft: settings.officeSqft,
            homeSqft: settings.homeSqft,
            otherItemized: settings.otherItemized,
            grandfathered: settings.grandfathered,
            marginalRate: Number(settings.bracket) / 100,
            reported1098: settings.reported[String(sum.year)] ?? "",
          })
        : null,
    [sum, rows, settings],
  );

  /* ---------- nothing loaded ---------- */
  if (!source || !read || !read.rows.length) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 p-8 text-white shadow-card lg:col-span-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-white/10 blur-2xl" />
          <House className="size-9 opacity-90" aria-hidden="true" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight">See how much mortgage interest you can deduct.</h2>
          <p className="mt-2 max-w-xl text-white/90">
            Add your mortgage payments. CashPilot totals the interest by year, shows where each payment goes, and works out the home-office share and the itemized deduction.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white">
              <FileUp className="size-4" aria-hidden="true" /> Upload mortgage CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <span className="rounded-2xl bg-white"><DriveImportButton onText={onText} /></span>
            <button type="button" onClick={() => void loadSample(SAMPLE_FULL, "Sample: servicer payment history")} className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white">
              <FlaskConical className="size-4" aria-hidden="true" /> Try the sample file
            </button>
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-white/90 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        </section>

        <Card className="lg:col-span-5">
          <CardTitle hint="Any of these works">What to upload</CardTitle>
          <ul className="space-y-3 text-sm font-medium text-gray-500">
            <li>
              <span className="font-semibold text-ink">A payment history from your lender.</span> Columns like Date, Payment, Principal, Interest, Escrow and Balance. This gives exact interest.
            </li>
            <li>
              <span className="font-semibold text-ink">Just the payments.</span> A date and an amount only. You add the interest rate and balance and we estimate the split.
            </li>
            {bankPayments.length > 0 && (
              <li>
                <span className="font-semibold text-ink">Your bank statement is already loaded.</span> We found {bankPayments.length} mortgage payments in it.
                <div className="mt-2">
                  <button type="button" onClick={useBank} className={btn}>Use those payments</button>
                </div>
              </li>
            )}
          </ul>
          <button type="button" onClick={() => void loadSample(SAMPLE_PAYMENTS, "Sample: payments only", { rate: "6.25", balance: "450000", escrow: "641.45" })} className={`${btn} mt-4`}>
            <FlaskConical className="size-4" aria-hidden="true" /> Try payments only (estimate)
          </button>
          <p className="mt-4 flex gap-2 rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Your lender's Form 1098 (box 1) is the official interest figure. Your file stays in this browser.
          </p>
        </Card>
      </div>
    );
  }

  const gotoFile = (
    <div className="mt-4 flex flex-wrap gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
        <FileUp className="size-4" aria-hidden="true" /> Upload another file
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      <DriveImportButton onText={onText} />
      <button type="button" onClick={clear} className={btn}>
        <Trash2 className="size-4" aria-hidden="true" /> Clear mortgage data
      </button>
    </div>
  );

  /* ---------- payments with no interest yet ---------- */
  if (needsTerms && !estimated) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardTitle hint={`${source.label} · ${read.rows.length} payments`}>One more step: your loan details</CardTitle>
          <p className="mb-4 text-sm font-medium text-gray-500">
            This file shows what you paid, not how much of it was interest. Enter three numbers from your mortgage statement and we'll estimate the split.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Interest rate (%)" hint="For example 6.25">
              <input inputMode="decimal" value={settings.terms.rate} onChange={(e) => setTerm("rate", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Balance before your first payment here ($)" hint="Principal still owed then">
              <input inputMode="decimal" value={settings.terms.balance} onChange={(e) => setTerm("balance", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Monthly escrow ($, optional)" hint="Property tax and insurance in the payment">
              <input inputMode="decimal" value={settings.terms.escrow} onChange={(e) => setTerm("escrow", e.target.value)} className={inputCls} />
            </Field>
          </div>
          {gotoFile}
        </Card>
      </div>
    );
  }

  if (!sum || !ded || !monthly) return null;

  const businessSlices = [
    { label: "Home-office share", value: ded.business, color: BLUE },
    { label: "Personal (Schedule A)", value: ded.personal, color: GREEN },
  ];

  /* ---------- loaded ---------- */
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <Card className="md:col-span-2 lg:col-span-12">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
              Mortgage {estimated && <Estimate />}
            </h3>
            <p className="mt-0.5 text-sm font-medium text-gray-500">
              {source.label} · {read.rows.length} payments{read.duplicates ? ` · ${read.duplicates} duplicate${read.duplicates > 1 ? "s" : ""} skipped` : ""}
              {read.skipped.length ? ` · ${read.skipped.length} unreadable row${read.skipped.length > 1 ? "s" : ""} skipped` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tax year">
            {years.map((s) => (
              <Chip key={s.year} active={s.year === y} onClick={() => setYear(s.year)}>
                {s.year}{s.partial ? "*" : ""}
              </Chip>
            ))}
          </div>
        </div>
        {years.some((s) => s.partial) && (
          <p className="mt-2 text-xs font-medium text-gray-400">* Fewer than 12 payments are in the file for that year, so its totals cover those payments only.</p>
        )}
        {needsTerms && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Interest rate (%)"><input inputMode="decimal" value={settings.terms.rate} onChange={(e) => setTerm("rate", e.target.value)} className={inputCls} /></Field>
            <Field label="Balance before the first payment ($)"><input inputMode="decimal" value={settings.terms.balance} onChange={(e) => setTerm("balance", e.target.value)} className={inputCls} /></Field>
            <Field label="Monthly escrow ($)"><input inputMode="decimal" value={settings.terms.escrow} onChange={(e) => setTerm("escrow", e.target.value)} className={inputCls} /></Field>
          </div>
        )}
        {gotoFile}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
      </Card>

      <section className="relative flex flex-col justify-between overflow-hidden rounded-[32px] bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 p-6 text-white shadow-card md:col-span-2 lg:col-span-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/85">Mortgage interest paid in {sum.year}{estimated ? " (estimate)" : ""}</p>
          <p className="mt-2 text-5xl font-bold tracking-tight">{usd(sum.interest)}</p>
          <p className="mt-2 max-w-lg text-sm font-medium text-white/90">
            {pct(sum.interestShare * 100, 0)} of what you paid toward the loan itself went to interest; the rest paid the balance down.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/20 px-3 py-1">{sum.count} payments</span>
            <span className="rounded-full bg-white/20 px-3 py-1">{usd(sum.principal)} paid down</span>
            {sum.endBalance !== null && <span className="rounded-full bg-white/20 px-3 py-1">{usd(sum.endBalance)} still owed</span>}
          </div>
        </div>
        {balances.length > 1 && (
          <div className="mt-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/80">Loan balance over time</p>
            <Sparkline values={balances} color="#ffffff" height={56} />
          </div>
        )}
      </section>

      <Card className="md:col-span-2 lg:col-span-5">
        <CardTitle hint={`Where your ${sum.year} payments went`}>Payment split</CardTitle>
        <Donut
          slices={[
            { label: "Interest", value: sum.interest, color: GREEN },
            { label: "Principal", value: sum.principal, color: BLUE },
            { label: "Escrow & fees", value: sum.escrow + sum.fees, color: VIOLET },
          ]}
          centerTop={usd(sum.payment)}
          centerBottom="paid in total"
          size={150}
          thickness={18}
        />
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <CardTitle hint={`Each month of ${sum.year}: interest is the bar, principal is the line`}>Interest and principal by month</CardTitle>
        <BarsLine labels={mortgage.MONTHS} bars={monthly.interest} line={monthly.principal} barLabel="Interest" lineLabel="Principal paid down" color={GREEN} lineColor={BLUE} />
      </Card>

      <Card className="md:col-span-2 lg:col-span-12">
        <CardTitle hint={`Your deduction for ${sum.year}. An estimate for planning, not tax advice.`}>What you can deduct</CardTitle>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Filing status">
                <select value={settings.filing} onChange={(e) => set("filing", e.target.value as Settings["filing"])} className={inputCls}>
                  <option value="single">Single</option>
                  <option value="mfj">Married filing jointly</option>
                </select>
              </Field>
              <Field label="Your tax bracket" hint="Used for the savings estimate">
                <select value={settings.bracket} onChange={(e) => set("bracket", e.target.value)} className={inputCls}>
                  {BRACKETS.map((b) => <option key={b} value={b}>{b}%</option>)}
                </select>
              </Field>
              <Field label="Home office size (sq ft)" hint="Leave empty if you have none">
                <input inputMode="decimal" value={settings.officeSqft} onChange={(e) => set("officeSqft", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Whole home size (sq ft)" hint={ded.officePct > 0 ? `Business use: ${pct(ded.officePct)}` : undefined}>
                <input inputMode="decimal" value={settings.homeSqft} onChange={(e) => set("homeSqft", e.target.value)} className={inputCls} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Other itemized deductions you expect ($)" hint="State and local taxes, charity and so on. Property tax in your escrow counts here.">
                  <input inputMode="decimal" value={settings.otherItemized} onChange={(e) => set("otherItemized", e.target.value)} className={inputCls} />
                </Field>
              </div>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm font-medium text-gray-500">
              <input type="checkbox" checked={settings.grandfathered} onChange={(e) => set("grandfathered", e.target.checked)} className="mt-1 size-4 accent-[#2E9A58]" />
              <span>My loan was taken out on or before December 15, 2017 <span className="text-gray-400">(the debt limit is $1,000,000 instead of $750,000)</span></span>
            </label>
          </div>

          <div>
            <div
              role="status"
              className={`mb-4 flex items-start gap-3 rounded-2xl p-4 ${ded.itemize ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="text-sm font-semibold">
                {ded.itemize
                  ? `Itemizing beats the standard deduction by ${usd(ded.itemized - ded.standard)}, so the mortgage interest helps.`
                  : `Itemizing is ${usd(ded.shortOfStandard)} short of the ${usd(ded.standard)} standard deduction, so the personal part of the interest adds nothing yet.`}
              </p>
            </div>
            <ProgressBar value={ded.itemized} max={ded.standard} tone={ded.itemize ? GREEN : "#F59E0B"} label="Itemized deductions compared with the standard deduction" />
            <p className="mb-3 mt-1 flex justify-between text-xs font-medium text-gray-400">
              <span>Itemized {usd(ded.itemized)}</span>
              <span>Standard {usd(ded.standard)}</span>
            </p>
            <Line k="Interest paid" v={usd(ded.interest, 2)} />
            {ded.capped && <Line k={`Allowed under the ${usd(ded.limit)} debt limit`} v={usd(ded.allowed, 2)} tone="text-amber-600" />}
            <Line k="Home-office share (Form 8829 or your accountable plan)" v={usd(ded.business, 2)} />
            <Line k="Personal share (Schedule A)" v={usd(ded.personal, 2)} />
            <Line k="Estimated income-tax saving" v={<>{usd(ded.totalSaved)} <Estimate /></>} strong tone="text-brand" />
            {ded.allowed > 0 && (
              <div className="mt-5">
                <Donut slices={businessSlices} centerTop={usd(ded.allowed)} centerBottom="deductible" size={120} thickness={15} />
              </div>
            )}
          </div>
        </div>
        {ded.capped && (
          <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-semibold text-amber-600">
            Your average balance is above the {usd(ded.limit)} limit, so the interest was cut in proportion. Confirm the exact figure with your lender or a CPA.
          </p>
        )}
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-ink">Month by year</h3>
            <p className="mt-0.5 text-sm font-medium text-gray-500">A pivot of your payments. Pick what to compare.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Measure">
            {METRICS.map((m) => <Chip key={m.id} active={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</Chip>)}
          </div>
        </div>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[420px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                <th className="w-24 pb-3 font-semibold">Month</th>
                {pivot.years.map((yr) => (
                  <th key={yr} className={`pb-3 text-right font-semibold ${yr === y ? "text-brand" : ""}`}>{yr}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivot.months.map((m, i) => (
                <tr key={m} className="border-t border-gray-100">
                  <td className="py-2 text-gray-500">{m}</td>
                  {pivot.cells[i].map((v, j) => (
                    <td
                      key={pivot.years[j]}
                      className="py-2 pr-1 text-right font-semibold tabular-nums text-ink"
                      style={v > 0 && pivot.max > 0 ? { backgroundColor: `rgba(46,154,88,${(0.05 + (pivot.max > pivotMin ? (v - pivotMin) / (pivot.max - pivotMin) : 1) * 0.32).toFixed(3)})` } : undefined}
                    >
                      {v > 0 ? usd(v, 2) : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-bold">
                <td className="py-3 text-ink">Total</td>
                {pivot.totals.map((t, j) => <td key={pivot.years[j]} className="py-3 pr-1 text-right tabular-nums text-ink">{usd(t, 2)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <CardTitle hint="Type the box 1 figure from your Form 1098 to check this file against what your lender reports">Year by year, and the Form 1098 check</CardTitle>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[720px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                {["Year", "Payments", "Interest", "Principal", "Escrow & fees", "Owed at year end", "Form 1098, box 1", "Check"].map((h) => (
                  <th key={h} className="pb-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((s) => {
                const rep = settings.reported[String(s.year)] ?? "";
                const d = mortgage.deduction({ interest: s.interest, reported1098: rep, filing: "single" });
                return (
                  <tr key={s.year} className="border-t border-gray-100">
                    <td className="py-3 font-semibold text-ink">{s.year}{s.partial ? "*" : ""}</td>
                    <td className="py-3 text-gray-500">{s.count}</td>
                    <td className="py-3 font-semibold text-ink">{usd(s.interest, 2)}</td>
                    <td className="py-3 text-gray-500">{usd(s.principal, 2)}</td>
                    <td className="py-3 text-gray-500">{usd(s.escrow + s.fees, 2)}</td>
                    <td className="py-3 text-gray-500">{s.endBalance !== null ? usd(s.endBalance, 2) : "–"}</td>
                    <td className="py-2 pr-3">
                      <input
                        inputMode="decimal"
                        aria-label={`Form 1098 box 1 for ${s.year}`}
                        placeholder="e.g. 27,512.40"
                        value={rep}
                        onChange={(e) => set("reported", { ...settings.reported, [String(s.year)]: e.target.value })}
                        className={`${inputCls} max-w-[150px]`}
                      />
                    </td>
                    <td className="py-3">
                      {d.diff === null ? (
                        <span className="text-gray-400">–</span>
                      ) : d.matches ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">Matches</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
                          File is {usd(Math.abs(d.diff), 2)} {d.diff > 0 ? "higher" : "lower"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs font-medium text-gray-400">
          Small differences are normal: a January payment can pay December's interest, and points or a first-year closing can change the lender's figure. The Form 1098 is the number to use when filing.
          The tax saving counts income tax only, not self-employment tax, and assumes the standard deduction applies unless itemizing is higher. These are estimates for planning, not tax advice; confirm them with a CPA.
        </p>
      </Card>
    </div>
  );
}
