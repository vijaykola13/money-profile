import * as React from "react";
import { CheckCircle2, Download, FileUp, FlaskConical, Search, TriangleAlert } from "lucide-react";
import { accountable, type Bucket, type Choice, type Plan, type Row } from "@/lib/accountable";
import { useData } from "@/lib/data-store";
import { DriveImportButton } from "./google-controls";
import { Card, CardTitle, usd } from "./ui";

const SAMPLE = "/samples/test_accountable_plan_usbank.csv";
const SAMPLE_KEY = "/samples/test_accountable_plan_answer_key.csv";
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 15;
const BUCKETS: Bucket[] = ["Home office", "Company car", "Medical"];
const FILTERS = ["All", "Eligible", "Needs review"] as const;
const CHOICES: Choice[] = ["Not eligible", ...BUCKETS];

const TONE: Record<Bucket, string> = {
  "Home office": "bg-blue-50 text-brand-blue",
  "Company car": "bg-orange-50 text-brand",
  Medical: "bg-emerald-50 text-emerald-600",
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function PlanInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-500">
      {label}
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          className="w-16 rounded-xl border-2 border-gray-200 px-2 py-1 text-right font-semibold text-ink"
        />
        %
      </span>
    </label>
  );
}

export function AccountableTab() {
  const [text, setText] = React.useState("");
  const [keyText, setKeyText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [loadError, setLoadError] = React.useState("");
  const [plan, setPlan] = React.useState<Plan>(() => ({ ...accountable.DEFAULT_PLAN }));
  const [overrides, setOverrides] = React.useState<Record<number, Choice>>({});
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [shown, setShown] = React.useState(PAGE);

  const data = useData();

  // The statement comes from the shared data source, so it is loaded once for every tab.
  React.useEffect(() => {
    setText(data.source.csv);
    setFileName(data.source.label);
    setOverrides({});
    setShown(PAGE);
    if (data.source.kind === "sample") {
      fetch(SAMPLE_KEY).then((r) => (r.ok ? r.text() : "")).then(setKeyText).catch(() => setKeyText(""));
    } else setKeyText("");
  }, [data.source.csv, data.source.label, data.source.kind]);

  const loadSample = async () => {
    setLoadError("");
    const r = await data.loadSample();
    if (!r.ok) setLoadError(r.error ?? "Couldn't load the sample file.");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setLoadError("That file is over 5 MB. Export a shorter date range.");
    setLoadError("");
    const r = await data.ingestRaw(await file.text(), file.name, "file");
    if (!r.ok) setLoadError(r.error ?? "Couldn't read that file.");
  };

  const read = React.useMemo(() => accountable.readTransactions(text), [text]);
  const automatic = React.useMemo(() => accountable.classifyAll(read.transactions, plan), [read, plan]);
  const rows = React.useMemo(
    () => automatic.map((r) => accountable.applyOverride(r, overrides[r.id] ?? null, plan)),
    [automatic, overrides, plan],
  );
  const summary = React.useMemo(() => accountable.summarize(rows), [rows]);
  // Scored on the automatic result, so edits and plan changes don't distort the accuracy figure.
  const score = React.useMemo(
    () => (keyText ? accountable.scoreAgainstKey(accountable.classifyAll(read.transactions, accountable.DEFAULT_PLAN), keyText) : null),
    [read, keyText],
  );

  const visible = rows.filter(
    (r) =>
      (filter === "All" || (filter === "Eligible" ? r.eligible : r.needsReview)) &&
      (r.name + r.category).toLowerCase().includes(query.trim().toLowerCase()),
  );

  const download = () => {
    const url = URL.createObjectURL(new Blob([accountable.toCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "accountable-plan-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const setChoice = (r: Row, value: string) =>
    setOverrides((o) => {
      const next = { ...o };
      if (value === "auto") delete next[r.id];
      else next[r.id] = value as Choice;
      return next;
    });

  const pctOf = (b: Bucket) => (b === "Home office" ? plan.homeOffice : b === "Company car" ? plan.companyCar : plan.medical);
  const full = score && score.matched === score.rows && score.mismatches.length === 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-[32px] bg-gradient-to-br from-orange-500 to-orange-400 p-5 text-white shadow-card">
          <span className="text-sm font-medium text-white/85">Total reimbursable</span>
          <p className="mt-6 truncate text-3xl font-bold tracking-tight">{usd(summary.total, 2)}</p>
          <p className="mt-1 text-xs font-medium text-white/85">
            {summary.eligibleCount} of {rows.length} transactions
          </p>
        </div>
        {BUCKETS.map((b) => (
          <div key={b} className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
            <span className="text-sm font-medium text-gray-500">{b}</span>
            <p className="mt-6 truncate text-3xl font-bold tracking-tight text-ink">{usd(summary.buckets[b], 2)}</p>
            <p className="mt-1 text-xs font-medium text-gray-400">
              {pctOf(b)}% business use · {rows.filter((r) => r.eligible && r.bucket === b).length} transactions
            </p>
          </div>
        ))}
      </div>

      <Card className="lg:col-span-4">
        <CardTitle hint="US Bank CSV: Date, Transaction, Name, Memo, Amount">Statement file</CardTitle>
        <p className="mb-3 truncate text-sm font-semibold text-ink" title={fileName}>
          {fileName || "No file loaded"}
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
            <FileUp className="size-4" aria-hidden="true" /> Upload CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <DriveImportButton />
          <button
            type="button"
            onClick={() => void loadSample()}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <FlaskConical className="size-4" aria-hidden="true" /> Load sample
          </button>
        </div>
        {loadError && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{loadError}</p>}
        <dl className="mt-4 space-y-1.5 text-sm font-medium">
          <div className="flex justify-between"><dt className="text-gray-500">Rows read</dt><dd className="font-semibold text-ink">{read.transactions.length}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Rows skipped</dt><dd className={`font-semibold ${read.skipped.length ? "text-red-500" : "text-ink"}`}>{read.skipped.length}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Needs review</dt><dd className={`font-semibold ${summary.needsReview ? "text-brand" : "text-ink"}`}>{summary.needsReview}</dd></div>
        </dl>
        {read.warnings.map((w) => (
          <p key={w} className="mt-3 flex gap-2 rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {w}
          </p>
        ))}
        {read.skipped.length > 0 && (
          <p className="mt-3 text-xs font-medium text-red-500">
            Skipped lines (not guessed at): {read.skipped.slice(0, 6).map((s) => s.line).join(", ")}
            {read.skipped.length > 6 ? "…" : ""}
          </p>
        )}
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint="Share of each cost that counts as business">Plan settings</CardTitle>
        <div className="space-y-3">
          <PlanInput label="Home office (mortgage, water, electric)" value={plan.homeOffice} onChange={(n) => setPlan((p) => ({ ...p, homeOffice: n }))} />
          <PlanInput label="Company car insurance" value={plan.companyCar} onChange={(n) => setPlan((p) => ({ ...p, companyCar: n }))} />
          <PlanInput label="Medical (doctor, dentist, Rx)" value={plan.medical} onChange={(n) => setPlan((p) => ({ ...p, medical: n }))} />
        </div>
        <p className="mt-4 text-xs font-medium text-gray-400">
          Company car insurer: {plan.companyCarInsurers.join(", ")}. Personal car insurer (not reimbursed): {plan.personalCarInsurers.join(", ")}.
        </p>
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint={score ? "Checked against the answer key" : "Upload the answer key file to score the result"}>Accuracy</CardTitle>
        {score ? (
          <>
            <div className={`flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold ${full ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-brand"}`}>
              {full ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <TriangleAlert className="size-5" aria-hidden="true" />}
              {full ? `All ${score.rows} transactions match the key` : `${score.mismatches.length} of ${score.rows} differ from the key`}
            </div>
            <dl className="mt-3 space-y-1.5 text-sm font-medium">
              <div className="flex justify-between"><dt className="text-gray-500">Category correct</dt><dd className="font-semibold text-ink">{score.categoryOk} / {score.rows}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Eligibility correct</dt><dd className="font-semibold text-ink">{score.eligibilityOk} / {score.rows}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Amount correct</dt><dd className="font-semibold text-ink">{score.amountOk} / {score.rows}</dd></div>
            </dl>
            {score.mismatches.slice(0, 4).map((m, i) => (
              <p key={i} className="mt-2 rounded-xl bg-gray-50 p-2 text-xs font-medium text-gray-500">
                {m.name}: expected {m.expected}, got {m.got}
              </p>
            ))}
          </>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-within:outline-2 focus-within:outline-brand">
            <FileUp className="size-4" aria-hidden="true" /> Upload answer key
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && f.size <= MAX_BYTES) setKeyText(await f.text());
              }}
            />
          </label>
        )}
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">Transactions</h3>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 focus-within:ring-2 focus-within:ring-brand/40">
              <Search className="size-4" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
                placeholder="Search"
                aria-label="Search transactions"
                className="w-32 bg-transparent text-ink outline-none placeholder:text-gray-400"
              />
            </label>
            <div className="inline-flex rounded-2xl border-2 border-gray-200 p-0.5" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => { setFilter(f); setShown(PAGE); }}
                  className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${filter === f ? "bg-zinc-950 text-white" : "text-gray-500 hover:text-ink"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={download}
              disabled={!rows.length}
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-ink transition hover:bg-gray-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Download className="size-4" aria-hidden="true" /> Export CSV
            </button>
          </div>
        </div>

        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[860px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                {["Date", "Name", "Amount", "Category", "Plan bucket", "Reimbursable", "Why", "Override"].map((h) => (
                  <th key={h} className="pb-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, shown).map((r) => (
                <tr key={r.id} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                  <td className="whitespace-nowrap py-3 text-gray-500">{fmtDate(r.date)}</td>
                  <td className="max-w-[230px] truncate py-3 text-ink" title={r.name}>{r.name}</td>
                  <td className={`py-3 font-bold ${r.amount > 0 ? "text-emerald-500" : "text-ink"}`}>{r.amount > 0 ? "+" : "−"}{usd(Math.abs(r.amount), 2)}</td>
                  <td className="py-3 text-ink">
                    {r.category}
                    {r.needsReview && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-brand">Review</span>}
                  </td>
                  <td className="py-3">
                    {r.bucket ? (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[r.bucket]}`}>{r.bucket} · {r.pct}%</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className={`py-3 font-bold ${r.eligible ? "text-ink" : "text-gray-300"}`}>{usd(r.reimbursable, 2)}</td>
                  <td className="max-w-[240px] truncate py-3 text-gray-500" title={r.note ? `${r.reason} ${r.note}` : r.reason}>
                    {r.edited && <span className="mr-1 font-semibold text-brand">Edited.</span>}
                    {r.reason}
                  </td>
                  <td className="py-3">
                    <select
                      aria-label={`Override for ${r.name}`}
                      value={overrides[r.id] ?? "auto"}
                      onChange={(e) => setChoice(r, e.target.value)}
                      className="rounded-xl border-2 border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <option value="auto">Automatic</option>
                      {CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr><td colSpan={8} className="py-10 text-center text-gray-400">{rows.length ? "No transactions match." : "Load a statement to begin."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {visible.length > shown && (
          <button
            type="button"
            onClick={() => setShown((s) => s + PAGE)}
            className="mt-3 w-full rounded-2xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand"
          >
            Show more ({visible.length - shown} left)
          </button>
        )}
        <p className="mt-4 text-xs font-medium text-gray-400">
          Assumptions to check with your CPA: the full mortgage payment is used (plans usually reimburse interest only); electric assumes an
          electric-only bill; owner medical costs usually run through a separate §105 / HRA arrangement. Not tax advice.
        </p>
      </Card>
    </div>
  );
}
