import * as React from "react";
import { Download, FileUp, FlaskConical, Link2Off, ListChecks, Trash2 } from "lucide-react";
import { importer as I, loadMapping } from "@/lib/importer";
import { loadLog, quickbooks as Q, saveLog, type DateStyle, type ExportResult, type Layout, type LogEntry } from "@/lib/quickbooks";
import type { Txn } from "@/lib/reconcile";
import { logEvent } from "@/lib/audit";
import { useData } from "@/lib/data-store";
import { Card, CardTitle, usd } from "./ui";

const SAMPLE = "/samples/test_accountable_plan_usbank.csv";
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 15;
const SCOPES = ["All", "Business only", "Personal only"] as const;
const DATE_STYLES: DateStyle[] = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const selectCls =
  "mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-2 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand";

export function QuickbooksTab() {
  const [fileName, setFileName] = React.useState("");
  const [txns, setTxns] = React.useState<Txn[]>([]);
  const [issues, setIssues] = React.useState<string[]>([]);
  const [error, setError] = React.useState("");

  const [scope, setScope] = React.useState<(typeof SCOPES)[number]>("All");
  const [layout, setLayout] = React.useState<Layout>("three");
  const [dateStyle, setDateStyle] = React.useState<DateStyle>("MM/DD/YYYY");
  const [maxRows, setMaxRows] = React.useState("1000");
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set());
  const [shown, setShown] = React.useState(PAGE);

  const [result, setResult] = React.useState<ExportResult | null>(null);
  const [log, setLog] = React.useState<LogEntry[]>(loadLog);

  const tagged = React.useMemo(() => txns.map((t, id) => ({ id, ...t, tag: I.tagLocal(t).tag })), [txns]);
  const inScope = tagged.filter((t) => scope === "All" || (scope === "Business only" ? t.tag === "Business" : t.tag === "Personal"));
  const selected = inScope.filter((t) => !excluded.has(t.id));

  const data = useData();

  // Transactions come from the shared data source, so a file loaded anywhere is ready here.
  React.useEffect(() => {
    setTxns(data.source.transactions);
    setFileName(data.source.label);
    setResult(null);
    setExcluded(new Set());
    setShown(PAGE);
    setError("");
  }, [data.source.csv, data.source.label]);

  const readIssues = (r: { notes: string[]; skipped: number; duplicates: number }) => [
    ...r.notes,
    ...(r.skipped ? [`${r.skipped} unreadable row(s) left out. Check them in the Import tab.`] : []),
    ...(r.duplicates ? [`${r.duplicates} exact duplicate row(s) left out.`] : []),
  ];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Export a shorter date range.");
    const r = await data.ingestRaw(await file.text(), file.name, "file");
    if (!r.ok) return setError(r.error ?? "Couldn't read that file.");
    setIssues(readIssues(r));
  };

  const loadSample = async (messy: boolean) => {
    setIssues([]);
    if (!messy) {
      const r = await data.loadSample();
      if (!r.ok) setError(r.error ?? "Couldn't load the sample file.");
      return;
    }
    try {
      const res = await fetch(SAMPLE);
      if (!res.ok) throw new Error("missing");
      const r = await data.ingestRaw(I.makeMessyDemo(await res.text()), "Demo: messy export", "file");
      if (!r.ok) return setError(r.error ?? "Couldn't read the demo.");
      setIssues(readIssues(r));
    } catch {
      setError("Couldn't load the sample file.");
    }
  };

  const toggle = (id: number) =>
    setExcluded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const prepare = () => {
    if (!selected.length) return;
    const out = Q.buildExport(selected, { layout, dateStyle, maxRows: Number(maxRows) || 1000 });
    setResult(out);
    const entry: LogEntry = {
      at: new Date().toISOString(),
      scope,
      layout,
      rows: out.summary.count,
      files: out.files.map((f) => f.name),
      moneyIn: out.summary.moneyIn,
      moneyOut: out.summary.moneyOut,
    };
    const next = [entry, ...log];
    setLog(next);
    saveLog(next);
    logEvent("export", `Prepared a QuickBooks file: ${out.summary.count} rows, ${scope}`);
  };

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = React.useMemo(() => Q.buildExport(selected, { layout, dateStyle, maxRows: Number(maxRows) || 1000 }).summary, [selected, layout, dateStyle, maxRows]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
        <div className="flex flex-col justify-between rounded-[32px] bg-gradient-to-br from-orange-500 to-orange-400 p-5 text-white shadow-card">
          <span className="text-sm font-medium text-white/85">Rows to export</span>
          <p className="mt-6 text-3xl font-bold tracking-tight">{summary.count}</p>
          <p className="mt-1 text-xs font-medium text-white/85">of {txns.length} in the file</p>
        </div>
        <div className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
          <span className="text-sm font-medium text-gray-500">Money in</span>
          <p className="mt-6 truncate text-3xl font-bold tracking-tight text-emerald-500">{usd(summary.moneyIn, 2)}</p>
          <p className="mt-1 text-xs font-medium text-gray-400">credits</p>
        </div>
        <div className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
          <span className="text-sm font-medium text-gray-500">Money out</span>
          <p className="mt-6 truncate text-3xl font-bold tracking-tight text-ink">{usd(summary.moneyOut, 2)}</p>
          <p className="mt-1 text-xs font-medium text-gray-400">debits</p>
        </div>
        <div className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
          <span className="text-sm font-medium text-gray-500">QuickBooks connection</span>
          <p className="mt-6 flex items-center gap-2 text-xl font-bold text-ink"><Link2Off className="size-5 text-gray-400" aria-hidden="true" /> Not connected</p>
          <p className="mt-1 text-xs font-medium text-gray-400">File export works now</p>
        </div>
      </div>

      <Card className="lg:col-span-4">
        <CardTitle hint={data.mode === "live" ? "Transactions from your linked bank" : "A bank CSV; the saved Import mapping is reused"}>Source</CardTitle>
        <p className="mb-3 truncate text-sm font-semibold text-ink" title={fileName}>{fileName || (data.mode === "live" ? "No bank linked" : "No file loaded")}</p>
        {data.mode === "live" ? (
          <p className="rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
            {data.source.kind === "live"
              ? "Using your linked bank. Reload the page to pull fresh transactions."
              : "No bank is linked yet. Connect one in Connections to export its transactions."}
          </p>
        ) : (
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
            <FileUp className="size-4" aria-hidden="true" /> Upload CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => void loadSample(false)} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Sample: US Bank
          </button>
          <button type="button" onClick={() => void loadSample(true)} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Demo: messy export
          </button>
        </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
        {issues.map((n) => (
          <p key={n} className="mt-3 rounded-2xl bg-orange-50 p-3 text-xs font-semibold text-brand">{n}</p>
        ))}
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint="Choose what QuickBooks will receive">Export settings</CardTitle>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-500">
            Which transactions
            <select value={scope} onChange={(e) => { setScope(e.target.value as (typeof SCOPES)[number]); setExcluded(new Set()); setResult(null); setShown(PAGE); }} className={selectCls}>
              {SCOPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-500">
            Columns
            <select value={layout} onChange={(e) => { setLayout(e.target.value as Layout); setResult(null); }} className={selectCls}>
              {(Object.keys(Q.FORMATS) as Layout[]).map((k) => <option key={k} value={k}>{Q.FORMATS[k].label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-500">
            Date format
            <select value={dateStyle} onChange={(e) => { setDateStyle(e.target.value as DateStyle); setResult(null); }} className={selectCls}>
              {DATE_STYLES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-500">
            Rows per file
            <input inputMode="numeric" value={maxRows} onChange={(e) => { setMaxRows(e.target.value.replace(/\D/g, "")); setResult(null); }} className={selectCls} />
          </label>
        </div>
        <button
          type="button"
          onClick={prepare}
          disabled={!selected.length}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ListChecks className="size-4" aria-hidden="true" /> Prepare export
        </button>
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint={result ? `${result.summary.count} rows ready` : "Prepare an export to get the files"}>Files</CardTitle>
        {result ? (
          <ul className="space-y-2">
            {result.files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2 rounded-2xl bg-gray-50 p-3">
                <span className="min-w-0 text-sm font-semibold text-ink"><span className="block truncate" title={f.name}>{f.name}</span><span className="text-xs font-medium text-gray-400">{f.rows} rows</span></span>
                <button type="button" onClick={() => download(f.name, f.text)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  <Download className="size-3.5" aria-hidden="true" /> Download
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium text-gray-400">No files yet.</p>
        )}
        <p className="mt-4 rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
          In QuickBooks Online, open Banking, choose Upload transactions, select the file, then match its columns to the account. Menu names change
          between versions, and the date format must match your QuickBooks settings. Direct sync to a QuickBooks company needs developer credentials
          and a sign-in, which this app doesn&apos;t have yet.
        </p>
      </Card>

      <Card className="min-w-0 md:col-span-2 lg:col-span-7">
        <CardTitle hint="Untick any row you don't want in the file">Transactions</CardTitle>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[520px] text-left text-sm font-medium">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-gray-400">
                <th className="w-8 pb-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={inScope.length > 0 && inScope.every((t) => !excluded.has(t.id))}
                    onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(inScope.map((t) => t.id)))}
                    className="size-4 accent-[#FF6B35]"
                  />
                </th>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Description</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Tag</th>
              </tr>
            </thead>
            <tbody>
              {inScope.slice(0, shown).map((t) => (
                <tr key={t.id} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                  <td className="py-3"><input type="checkbox" aria-label={`Include ${t.name}`} checked={!excluded.has(t.id)} onChange={() => toggle(t.id)} className="size-4 accent-[#FF6B35]" /></td>
                  <td className="whitespace-nowrap py-3 text-gray-500">{fmtDate(t.date)}</td>
                  <td className="max-w-[260px] truncate py-3 text-ink" title={t.name}>{t.name}</td>
                  <td className={`py-3 font-bold ${t.amount > 0 ? "text-emerald-500" : "text-ink"}`}>{t.amount > 0 ? "+" : "−"}{usd(Math.abs(t.amount), 2)}</td>
                  <td className="py-3 text-xs font-semibold text-gray-500">{t.tag}</td>
                </tr>
              ))}
              {!inScope.length && <tr><td colSpan={5} className="py-10 text-center text-gray-400">{txns.length ? "No transactions in this scope." : data.mode === "live" ? "Link a bank in Connections to begin." : "Load a bank file to begin."}</td></tr>}
            </tbody>
          </table>
        </div>
        {inScope.length > shown && (
          <button type="button" onClick={() => setShown((s) => s + PAGE)} className="mt-3 w-full rounded-2xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            Show more ({inScope.length - shown} left)
          </button>
        )}
      </Card>

      <Card className="md:col-span-2 lg:col-span-5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle hint="Every export prepared in this browser">Sync log</CardTitle>
          {log.length > 0 && (
            <button type="button" onClick={() => { setLog([]); saveLog([]); }} className="inline-flex items-center gap-1.5 rounded-xl border-2 border-gray-200 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
              <Trash2 className="size-3.5" aria-hidden="true" /> Clear
            </button>
          )}
        </div>
        {log.length ? (
          <ul className="space-y-2">
            {log.slice(0, 8).map((e) => (
              <li key={e.at} className="rounded-2xl bg-gray-50 p-3 text-sm font-medium text-gray-500">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{e.rows} rows · {e.scope}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">File ready</span>
                </p>
                <p className="text-xs">{fmtTime(e.at)} · {e.layout === "three" ? "3 columns" : "4 columns"} · in {usd(e.moneyIn, 2)} · out {usd(e.moneyOut, 2)}</p>
                <p className="truncate text-xs text-gray-400" title={e.files.join(", ")}>{e.files.join(", ")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium text-gray-400">Nothing exported yet.</p>
        )}
      </Card>
    </div>
  );
}
