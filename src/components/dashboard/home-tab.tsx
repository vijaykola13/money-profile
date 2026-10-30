import * as React from "react";
import { CheckCircle2, FileUp, FlaskConical, PiggyBank, ShieldCheck, Sparkles, Trash2, Wallet } from "lucide-react";
import { BarsLine, Donut, HBars, Sparkline } from "@/components/charts";
import { computeBooks } from "@/lib/books";
import { useData } from "@/lib/data-store";
import { loadLearned } from "@/lib/importer";
import { loadLog } from "@/lib/quickbooks";
import { loadSaved } from "@/lib/reconcile";
import { DriveImportButton } from "./google-controls";
import { Card, CardTitle, pct, usd } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthName = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const monthShort = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const nextMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
};

function Stat({ title, value, sub, icon }: { title: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="group flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card transition duration-300 hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-500 transition group-hover:bg-orange-50 group-hover:text-brand">{icon}</span>
      </div>
      <p className="mt-6 truncate text-3xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs font-medium text-gray-400">{sub}</p>
    </div>
  );
}

export function HomeTab({ go }: { go: (tab: string) => void }) {
  const data = useData();
  const [error, setError] = React.useState("");
  const [learned] = React.useState(loadLearned);

  const books = React.useMemo(() => computeBooks(data.source.transactions, { learned }), [data.source.transactions, learned]);
  const lastRec = React.useMemo(() => loadSaved().history[0], []);
  const lastExport = React.useMemo(() => loadLog()[0], []);

  // Where the money goes: the biggest spending categories, with the rest grouped.
  const categories = React.useMemo(() => {
    if (!books) return [];
    const totals = new Map<string, number>();
    for (const r of books.planRows) if (r.amount < 0) totals.set(r.category, (totals.get(r.category) ?? 0) + Math.abs(r.amount));
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6).map(([label, value]) => ({ label, value }));
    const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
    return rest > 0 ? [...top, { label: "Everything else", value: rest }] : top;
  }, [books]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Export a shorter date range.");
    setError("");
    const r = await data.ingestRaw(await file.text(), file.name, "file");
    if (!r.ok) setError(r.error ?? "Couldn't read that file.");
  };

  const loadSample = async () => {
    setError("");
    const r = await data.loadSample();
    if (!r.ok) setError(r.error ?? "Couldn't load the sample file.");
  };

  const upload = (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
      <FileUp className="size-4" aria-hidden="true" /> Upload bank CSV
      <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
    </label>
  );

  if (!books) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 p-8 text-white shadow-card lg:col-span-8">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 size-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
          <p className="relative text-sm font-semibold uppercase tracking-widest text-white/80">Your money. Your next move.</p>
          <h2 className="relative mt-2 max-w-xl text-4xl font-bold leading-tight tracking-tight">Steady pay for irregular income.</h2>
          <p className="relative mt-3 max-w-xl text-sm font-medium text-white/85">
            Bring in a bank statement and CashPilot reconciles it to the penny, sorts business from personal, pays you a steady paycheck from a
            holding pot, sets tax aside and exports to QuickBooks.
          </p>
          <div className="relative mt-6 flex flex-wrap gap-2">
            {upload}
            <DriveImportButton />
            <button type="button" onClick={() => void loadSample()} className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
              <FlaskConical className="size-4" aria-hidden="true" /> Try the sample statement
            </button>
          </div>
          {error && <p role="alert" className="relative mt-3 rounded-xl bg-black/25 px-3 py-2 text-sm font-semibold">{error}</p>}
        </section>

        <Card className="lg:col-span-4">
          <img src="/brand/logo-full.png" alt="CashPilot: Your money. Your next move." width={427} height={472} className="mx-auto mb-4 h-40 w-auto" />
          <CardTitle hint="Everything you load stays in this browser">What you get</CardTitle>
          <ul className="space-y-3 text-sm font-medium text-gray-500">
            {[
              [ShieldCheck, "Reconcile to $0.00 and lock the statement"],
              [Wallet, "A steady paycheck from a holding pot"],
              [PiggyBank, "Tax set aside and quarterly payments planned"],
              [Sparkles, "Business or personal, with a reason for each"],
            ].map(([Icon, text]) => (
              <li key={text as string} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-brand">
                  {React.createElement(Icon as typeof Wallet, { className: "size-5", "aria-hidden": true })}
                </span>
                {text as string}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs font-medium text-gray-400">
            Prefer a live connection? Choose <strong className="text-ink">Connect live</strong> at the top (advanced preview).
          </p>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const nextQ = books.tax.quarterly.find((q) => q.due >= today) ?? books.tax.quarterly[books.tax.quarterly.length - 1];
  const lastMonth = books.monthly.months[books.monthly.months.length - 1];
  const future = nextMonths(lastMonth, 3);
  const pots = books.sim.map((m) => m.pot);

  const steps = [
    { tab: "import", title: "Import and tag", status: `${books.span.count} transactions · ${books.tags.needsReview} worth a look`, done: true },
    { tab: "reconcile", title: "Reconcile", status: lastRec ? `Last: ${usd(lastRec.ending, 2)} on ${new Date(lastRec.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Not reconciled yet", done: !!lastRec },
    { tab: "paycheck", title: "Pay yourself steadily", status: `${usd(books.recommended)} a month · ${Math.round(books.rate * 100)}% set aside`, done: true },
    { tab: "taxplan", title: "Plan quarterly tax", status: `Next: ${nextQ.id} due ${fmtDate(nextQ.due)} · ${usd(nextQ.amountDue)}`, done: true },
    { tab: "accountable", title: "Accountable plan", status: `${usd(books.plan.total, 2)} reimbursable`, done: true },
    { tab: "quickbooks", title: "Export to QuickBooks", status: lastExport ? `Last file: ${lastExport.rows} rows` : "Not exported yet", done: !!lastExport },
    { tab: "report", title: "Accountant report", status: "Print or save as PDF", done: false },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <Card className="md:col-span-2 lg:col-span-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">{data.source.label}</p>
            <p className="text-xs font-medium text-gray-400">
              {books.span.count} transactions · {fmtDate(books.span.first)} to {fmtDate(books.span.last)} · {books.span.months} months
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {upload}
            <DriveImportButton />
            {data.source.kind !== "live" && (
              <button type="button" onClick={data.clear} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
                <Trash2 className="size-4" aria-hidden="true" /> Clear my data
              </button>
            )}
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
      </Card>

      <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 p-7 text-white shadow-card md:col-span-2 lg:col-span-12">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="relative grid items-end gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-white/80">Safe to pay yourself</p>
            <p className="mt-2 text-6xl font-bold tracking-tight">
              {usd(books.recommended)}
              <span className="ml-2 text-xl font-semibold text-white/80">a month</span>
            </p>
            <p className="mt-2 max-w-md text-sm font-medium text-white/85">
              The highest steady paycheck your history could have paid every month, with {Math.round(books.rate * 100)}% of each deposit set aside for tax.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-white/20 px-3 py-1">Pot now {usd(books.pot.endPot)}</span>
              <span className="rounded-full bg-white/20 px-3 py-1">{books.pot.runwayMonths} months of runway</span>
              <span className="rounded-full bg-white/20 px-3 py-1">Income swings {pct(books.incomeSwing * 100, 0)}</span>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/70">Holding pot over time</p>
            <Sparkline values={pots} color="#ffffff" height={96} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-3">
        <Stat title="Tax set-aside" value={pct(books.rate * 100, 0)} sub={`of each deposit · est. ${usd(books.estimate.total)} a year`} icon={<PiggyBank className="size-5" />} />
        <Stat title="Worth a look" value={String(books.tags.needsReview)} sub={`low-confidence tags · ${usd(books.tags.business)} business spend`} icon={<Sparkles className="size-5" />} />
        <Stat title="Reimbursable" value={usd(books.plan.total, 2)} sub={`${books.plan.eligibleCount} accountable-plan transactions`} icon={<Wallet className="size-5" />} />
      </div>

      <Card className="md:col-span-2 lg:col-span-7">
        <CardTitle hint="Deposits each month against your steady paycheck">Income vs steady paycheck</CardTitle>
        <BarsLine
          labels={books.monthly.months.map(monthShort)}
          bars={books.monthly.income}
          barLabel="Deposits"
          line={books.recommended}
          lineLabel={`Paycheck ${usd(books.recommended)}`}
          height={220}
        />
      </Card>

      <Card className="md:col-span-2 lg:col-span-5">
        <CardTitle hint="Spending split by the Business or Personal tag">Business vs personal</CardTitle>
        <Donut
          slices={[
            { label: "Business", value: books.tags.business, color: "#3B82F6" },
            { label: "Personal", value: books.tags.personal, color: "#FF6B35" },
          ]}
          centerTop={usd(books.tags.business + books.tags.personal)}
          centerBottom="total spending"
        />
      </Card>

      <Card className="md:col-span-2 lg:col-span-5">
        <CardTitle hint="Your biggest spending categories">Where the money goes</CardTitle>
        <HBars rows={categories} />
      </Card>

      <Card className="md:col-span-2 lg:col-span-7">
        <CardTitle hint="Follow the steps, or jump to any tab">Your books, step by step</CardTitle>
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map((s, i) => (
            <li key={s.tab}>
              <button type="button" onClick={() => go(s.tab)} className="flex h-full w-full items-center gap-3 rounded-2xl bg-gray-50 p-3 text-left transition hover:-translate-y-0.5 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${s.done ? "bg-emerald-50 text-emerald-600" : "bg-white text-gray-400 shadow-card"}`}>
                  {s.done ? <CheckCircle2 className="size-5" aria-hidden="true" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{s.title}</span>
                  <span className="block truncate text-xs font-medium text-gray-500">{s.status}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="md:col-span-2 lg:col-span-12">
        <CardTitle hint="If income stays at its recent average (bars), or falls to its recent low (line)">Next three months of your pot</CardTitle>
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <BarsLine
            labels={future.map(monthShort)}
            bars={books.forecast.expected.map((m) => m.pot)}
            barLabel="Expected pot"
            line={books.forecast.lean.map((m) => m.pot)}
            lineLabel="Lean pot"
            color="#10B981"
            lineColor="#8B5CF6"
            height={170}
          />
          <div>
            <table className="w-full text-left text-sm font-medium">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-400">
                  <th className="pb-2 font-semibold">Month</th>
                  <th className="pb-2 font-semibold">Expected</th>
                  <th className="pb-2 font-semibold">Lean</th>
                </tr>
              </thead>
              <tbody>
                {future.map((m, i) => (
                  <tr key={m} className="border-t border-gray-100">
                    <td className="py-2.5 text-ink">{monthName(m)}</td>
                    <td className="py-2.5 font-bold text-ink">{usd(books.forecast.expected[i].pot)}</td>
                    <td className={`py-2.5 font-bold ${books.forecast.lean[i].shortfall > 0 ? "text-red-500" : "text-ink"}`}>
                      {usd(books.forecast.lean[i].pot)}
                      {books.forecast.lean[i].shortfall > 0 && <span className="ml-2 text-xs font-semibold">short {usd(books.forecast.lean[i].shortfall)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs font-medium text-gray-400">
              Expected income {usd(books.forecast.expectedIncome)} a month, lean {usd(books.forecast.leanIncome)}, with a {usd(books.recommended)} paycheck. Based on past
              deposits only.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
