import * as React from "react";
import { CheckCircle2, FileUp, FlaskConical, Trash2 } from "lucide-react";
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
const nextMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
};

function Stat({ title, value, sub, accent = false }: { title: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`flex flex-col justify-between rounded-[32px] p-5 shadow-card ${accent ? "bg-gradient-to-br from-orange-500 to-orange-400 text-white" : "bg-white text-ink"}`}>
      <span className={`text-sm font-medium ${accent ? "text-white/85" : "text-gray-500"}`}>{title}</span>
      <p className="mt-6 truncate text-3xl font-bold tracking-tight">{value}</p>
      <p className={`mt-1 text-xs font-medium ${accent ? "text-white/85" : "text-gray-400"}`}>{sub}</p>
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
        <Card className="lg:col-span-8">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Steady pay for irregular income</h2>
          <p className="mt-2 max-w-xl text-sm font-medium text-gray-500">
            Bring in a bank statement and the app reconciles it to the penny, sorts business from personal, pays you a steady paycheck from a
            holding pot, sets tax aside, and exports to QuickBooks.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {upload}
            <DriveImportButton />
            <button type="button" onClick={() => void loadSample()} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
              <FlaskConical className="size-4" aria-hidden="true" /> Try the sample statement
            </button>
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
          <p className="mt-4 text-xs font-medium text-gray-400">
            Your file stays in this browser. Any bank&apos;s CSV works, in any column order; you confirm the column mapping once in the Import tab.
          </p>
        </Card>
        <Card className="lg:col-span-4">
          <CardTitle hint="Choose it at the top of the page">Prefer a live connection?</CardTitle>
          <p className="text-sm font-medium text-gray-500">
            Switch the data source to <strong className="text-ink">Connect live</strong> to link a bank and brokerage (sandbox preview) and run the same
            tools on live data.
          </p>
        </Card>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const nextQ = books.tax.quarterly.find((q) => q.due >= today) ?? books.tax.quarterly[books.tax.quarterly.length - 1];
  const lastMonth = books.monthly.months[books.monthly.months.length - 1];
  const future = nextMonths(lastMonth, 3);

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

      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
        <Stat accent title="Safe to pay yourself" value={usd(books.recommended)} sub="a month: the highest paycheck your history could have paid every month" />
        <Stat title="Tax set-aside" value={pct(books.rate * 100, 0)} sub={`of each deposit · est. ${usd(books.estimate.total)} a year`} />
        <Stat title="Worth a look" value={String(books.tags.needsReview)} sub={`low-confidence tags · ${usd(books.tags.business)} business spend`} />
        <Stat title="Reimbursable" value={usd(books.plan.total, 2)} sub={`${books.plan.eligibleCount} accountable-plan transactions`} />
      </div>

      <Card className="lg:col-span-7">
        <CardTitle hint="Follow the steps, or jump to any tab">Your books, step by step</CardTitle>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.tab}>
              <button type="button" onClick={() => go(s.tab)} className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 p-3 text-left transition hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand">
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

      <Card className="lg:col-span-5">
        <CardTitle hint="If income stays at its recent average, or falls to its recent low">Next three months</CardTitle>
        <table className="w-full text-left text-sm font-medium">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-400">
              <th className="pb-2 font-semibold">Month</th>
              <th className="pb-2 font-semibold">Pot (expected)</th>
              <th className="pb-2 font-semibold">Pot (lean)</th>
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
          Expected income {usd(books.forecast.expectedIncome)} a month, lean {usd(books.forecast.leanIncome)}, with a {usd(books.recommended)} paycheck. Based on
          past deposits only.
        </p>
      </Card>
    </div>
  );
}
