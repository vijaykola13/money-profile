import * as React from "react";
import { CheckCheck, CheckCircle2, FileUp, FlaskConical, Lock, RotateCcw, Search, TriangleAlert } from "lucide-react";
import { accountable } from "@/lib/accountable";
import {
  clearSaved,
  DEFAULT_ACCOUNT,
  loadSaved,
  reconcile as R,
  save,
  type Account,
  type AccountType,
  type Cause,
  type KeyedRow,
  type Saved,
} from "@/lib/reconcile";
import { Card, CardTitle, usd } from "./ui";

const SAMPLE = "/samples/test_accountable_plan_usbank.csv";
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 20;
const FILTERS = ["All", "Unticked", "Ticked"] as const;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[$,\s]/g, "")));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
const inputCls =
  "w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand";

export function ReconcileTab() {
  const [saved, setSaved] = React.useState<Saved>(loadSaved);
  const [startText, setStartText] = React.useState(() => String(saved.account.starting));
  const [type, setType] = React.useState<AccountType>(saved.account.type);
  const [asOf, setAsOf] = React.useState(saved.account.asOf);
  const [endText, setEndText] = React.useState("");

  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<KeyedRow[]>([]);
  const [alreadyDone, setAlreadyDone] = React.useState(0);
  const [skippedLines, setSkippedLines] = React.useState(0);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");
  const [hint, setHint] = React.useState("");

  const [ticked, setTicked] = React.useState<Set<number>>(new Set());
  const [reconciled, setReconciled] = React.useState<Set<number>>(new Set());
  const [finished, setFinished] = React.useState<{ ending: number; count: number } | null>(null);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [shown, setShown] = React.useState(PAGE);

  const starting = num(startText);
  const ending = num(endText);
  const ready = Number.isFinite(starting) && Number.isFinite(ending) && rows.length > 0;

  const tickedRows = rows.filter((r) => ticked.has(r.id));
  const diff = ready ? R.difference(type, starting, ending, tickedRows) : null;
  const computed = Number.isFinite(starting) ? R.computedBalance(type, starting, tickedRows) : null;
  const causes: Cause[] =
    ready && diff !== 0 && !finished ? R.suggestCauses({ type, starting, ending, rows, tickedIds: ticked }) : [];
  const canFinish = ready && diff === 0 && ticked.size > 0 && !finished;

  const ingest = (transactions: { date: string; name: string; amount: number }[], lockedKeys: string[]) => {
    const keyed = R.withKeys(transactions);
    const { fresh, skipped } = R.skipLocked(keyed, lockedKeys);
    setRows(fresh.map((r, i) => ({ ...r, id: i })));
    setAlreadyDone(skipped.length);
    setTicked(new Set());
    setReconciled(new Set());
    setFinished(null);
    setShown(PAGE);
  };

  const loadText = (text: string, name: string) => {
    const read = accountable.readTransactions(text);
    setFileName(name);
    setWarnings(read.warnings);
    setSkippedLines(read.skipped.length);
    setError(read.transactions.length ? "" : "No readable transactions in that file.");
    ingest(read.transactions, saved.lockedKeys);
    return read;
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Export a shorter date range.");
    setHint("");
    loadText(await file.text(), file.name);
  };

  /** Demo: starts at $10,000.00 and the statement ending balance is computed from the full file. */
  const loadDemo = async (dropRow: boolean) => {
    setError("");
    try {
      const res = await fetch(SAMPLE);
      if (!res.ok) throw new Error("missing");
      const read = accountable.readTransactions(await res.text());
      const account = DEFAULT_ACCOUNT;
      const total = R.round2(read.transactions.reduce((s, t) => s + t.amount, 0));
      const statementEnding = R.round2(account.starting + total);
      const { transactions, removed } = dropRow ? R.dropDemoRow(read.transactions) : { transactions: read.transactions, removed: null };
      setType(account.type);
      setStartText(String(account.starting));
      setAsOf(account.asOf);
      setEndText(statementEnding.toFixed(2));
      setFileName(dropRow ? "Demo: one row missing from the file" : "Demo: US Bank export, complete");
      setWarnings([]);
      setSkippedLines(0);
      setHint(
        dropRow && removed
          ? `Demo: the statement says ${usd(statementEnding, 2)}, but the file is missing a row. Tick everything and see what the app suggests.`
          : `Demo: the statement says ${usd(statementEnding, 2)}. Tick everything to reach $0.00.`,
      );
      // The demo always starts clean so it can be repeated.
      ingest(transactions, []);
    } catch {
      setError("Couldn't load the demo file.");
    }
  };

  const toggle = (id: number) =>
    setTicked((t) => {
      const next = new Set(t);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allOpen = rows.filter((r) => !reconciled.has(r.id));
  const allTicked = allOpen.length > 0 && allOpen.every((r) => ticked.has(r.id));
  const checkAll = () => setTicked(allTicked ? new Set(reconciled) : new Set(rows.map((r) => r.id)));

  const finish = () => {
    if (!canFinish) return;
    const account: Account = R.carryForward({ type, starting, asOf }, ending, tickedRows);
    const next: Saved = {
      account,
      lockedKeys: [...saved.lockedKeys, ...tickedRows.map((r) => r.key)],
      history: [{ finishedAt: new Date().toISOString(), ending, count: tickedRows.length, type }, ...saved.history].slice(0, 20),
    };
    setSaved(next);
    save(next);
    setReconciled(new Set(ticked));
    setFinished({ ending, count: tickedRows.length });
  };

  const startNext = () => {
    setStartText(String(saved.account.starting));
    setAsOf(saved.account.asOf);
    setEndText("");
    setRows([]);
    setTicked(new Set());
    setReconciled(new Set());
    setFinished(null);
    setFileName("");
    setHint("");
    setAlreadyDone(0);
  };

  const reset = () => {
    clearSaved();
    const fresh: Saved = { account: DEFAULT_ACCOUNT, lockedKeys: [], history: [] };
    setSaved(fresh);
    setType(DEFAULT_ACCOUNT.type);
    setStartText(String(DEFAULT_ACCOUNT.starting));
    setAsOf(DEFAULT_ACCOUNT.asOf);
    startNext();
    setStartText(String(DEFAULT_ACCOUNT.starting));
  };

  const visible = rows.filter(
    (r) =>
      (filter === "All" || (filter === "Ticked" ? ticked.has(r.id) : !ticked.has(r.id))) &&
      (r.name + r.date).toLowerCase().includes(query.trim().toLowerCase()),
  );

  const ok = diff === 0;
  const diffTone = diff == null ? "text-gray-300" : ok ? "text-emerald-500" : "text-red-500";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <Card className="lg:col-span-4">
        <CardTitle hint="Starting balance carries forward from your last reconciliation">Account</CardTitle>
        <div className="space-y-3">
          <Field label="Account type">
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)} disabled={!!finished} className={inputCls}>
              <option value="checking">Checking</option>
              <option value="credit">Credit card (balance owed)</option>
            </select>
          </Field>
          <Field label="Starting balance">
            <input inputMode="decimal" value={startText} onChange={(e) => setStartText(e.target.value)} disabled={!!finished} className={inputCls} />
          </Field>
          <Field label="As of">
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} disabled={!!finished} className={inputCls} />
          </Field>
          <Field label="Statement ending balance">
            <input inputMode="decimal" placeholder="e.g. 24,310.55" value={endText} onChange={(e) => setEndText(e.target.value)} disabled={!!finished} className={inputCls} />
          </Field>
        </div>
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint="US Bank CSV: Date, Transaction, Name, Memo, Amount">Statement file</CardTitle>
        <p className="mb-3 truncate text-sm font-semibold text-ink" title={fileName}>{fileName || "No file loaded"}</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
            <FileUp className="size-4" aria-hidden="true" /> Upload CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => void loadDemo(false)} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Demo: balances
          </button>
          <button type="button" onClick={() => void loadDemo(true)} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Demo: missing row
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
        {hint && <p className="mt-3 rounded-2xl bg-orange-50 p-3 text-xs font-semibold text-brand">{hint}</p>}
        <dl className="mt-4 space-y-1.5 text-sm font-medium">
          <div className="flex justify-between"><dt className="text-gray-500">Rows to reconcile</dt><dd className="font-semibold text-ink">{rows.length}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Already reconciled (skipped)</dt><dd className="font-semibold text-ink">{alreadyDone}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Unreadable lines</dt><dd className={`font-semibold ${skippedLines ? "text-red-500" : "text-ink"}`}>{skippedLines}</dd></div>
        </dl>
        {warnings.map((w) => (
          <p key={w} className="mt-3 flex gap-2 rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {w}
          </p>
        ))}
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint="Ticked transactions against the statement">Difference</CardTitle>
        <p className={`text-5xl font-bold tracking-tight ${diffTone}`} role="status" aria-live="polite">
          {diff == null ? "—" : usd(diff, 2)}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {diff == null ? "Enter both balances and load a file." : ok ? "Balanced. You can finish." : "Not balanced yet."}
        </p>
        <dl className="mt-4 space-y-1.5 text-sm font-medium">
          <div className="flex justify-between"><dt className="text-gray-500">Starting balance</dt><dd className="font-semibold text-ink">{Number.isFinite(starting) ? usd(starting, 2) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Computed from ticked</dt><dd className="font-semibold text-ink">{computed != null ? usd(computed, 2) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Statement ending</dt><dd className="font-semibold text-ink">{Number.isFinite(ending) ? usd(ending, 2) : "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-gray-500">Ticked</dt><dd className="font-semibold text-ink">{ticked.size} of {rows.length}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={checkAll} disabled={!rows.length || !!finished} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand">
            <CheckCheck className="size-4" aria-hidden="true" /> {allTicked ? "Uncheck all" : "Check all"}
          </button>
          <button type="button" onClick={finish} disabled={!canFinish} className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <Lock className="size-4" aria-hidden="true" /> Finish
          </button>
        </div>
      </Card>

      {finished && (
        <Card className="md:col-span-2 lg:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              Reconciled {finished.count} transactions to {usd(finished.ending, 2)}. They are marked R and locked. This balance is now your starting balance for the next import.
            </p>
            <button type="button" onClick={startNext} className="rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Start next statement
            </button>
          </div>
        </Card>
      )}

      {causes.length > 0 && (
        <Card className="md:col-span-2 lg:col-span-12">
          <CardTitle hint="Likely reasons the ticked transactions don't match the statement">Why it might not balance</CardTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {causes.map((c) => (
              <li key={c.kind} className="rounded-2xl bg-gray-50 p-4">
                <p className="text-sm font-bold text-ink">{c.title}</p>
                <p className="mt-1 text-sm font-medium text-gray-500">{c.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="min-w-0 md:col-span-2 lg:col-span-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">Transactions</h3>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 focus-within:ring-2 focus-within:ring-brand/40">
              <Search className="size-4" aria-hidden="true" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search" aria-label="Search transactions" className="w-32 bg-transparent text-ink outline-none placeholder:text-gray-400" />
            </label>
            <div className="inline-flex rounded-2xl border-2 border-gray-200 p-0.5" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }} className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${filter === f ? "bg-zinc-950 text-white" : "text-gray-500 hover:text-ink"}`}>
                  {f}
                </button>
              ))}
            </div>
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand" title="Clears the saved balance and reconciled history">
              <RotateCcw className="size-4" aria-hidden="true" /> Reset saved data
            </button>
          </div>
        </div>

        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[620px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                <th className="w-8 pb-3">
                  <input type="checkbox" aria-label="Check all" checked={allTicked} disabled={!rows.length || !!finished} onChange={checkAll} className="size-4 accent-[#FF6B35]" />
                </th>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Name</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, shown).map((r) => {
                const locked = reconciled.has(r.id);
                return (
                  <tr key={r.id} className={`border-t border-gray-100 transition-colors hover:bg-[#F9FAFB] ${ticked.has(r.id) ? "bg-orange-50/40" : ""}`}>
                    <td className="py-3">
                      <input type="checkbox" aria-label={`Tick ${r.name} on ${r.date}`} checked={ticked.has(r.id)} disabled={locked} onChange={() => toggle(r.id)} className="size-4 accent-[#FF6B35]" />
                    </td>
                    <td className="whitespace-nowrap py-3 text-gray-500">{fmtDate(r.date)}</td>
                    <td className="max-w-[320px] truncate py-3 text-ink" title={r.name}>{r.name}</td>
                    <td className={`py-3 font-bold ${r.amount > 0 ? "text-emerald-500" : "text-ink"}`}>{r.amount > 0 ? "+" : "−"}{usd(Math.abs(r.amount), 2)}</td>
                    <td className="py-3">
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600"><Lock className="size-3" aria-hidden="true" /> R</span>
                      ) : ticked.has(r.id) ? (
                        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-brand">Ticked</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">{rows.length ? "No transactions match." : "Load a statement file or a demo to begin."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {visible.length > shown && (
          <button type="button" onClick={() => setShown((s) => s + PAGE)} className="mt-3 w-full rounded-2xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            Show more ({visible.length - shown} left)
          </button>
        )}

        {saved.history.length > 0 && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-ink">Reconciliation history</h4>
            <ul className="space-y-1 text-sm font-medium text-gray-500">
              {saved.history.slice(0, 5).map((h) => (
                <li key={h.finishedAt}>
                  {new Date(h.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}: {h.count} transactions to {usd(h.ending, 2)} ({h.type === "credit" ? "credit card" : "checking"})
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
