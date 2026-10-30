import * as React from "react";
import { Download, FileUp, FlaskConical, Search, Sparkles, TriangleAlert } from "lucide-react";
import {
  FIELD_LABELS,
  aiConfigured,
  aiMapping,
  aiTags,
  importer as I,
  loadLearned,
  loadMapping,
  saveLearned,
  saveMapping,
  type Mapping,
  type Tag,
  type TagInfo,
} from "@/lib/importer";
import { logEvent } from "@/lib/audit";
import { useData } from "@/lib/data-store";
import { DriveImportButton } from "./google-controls";
import { Card, CardTitle, usd } from "./ui";

const SAMPLE = "/samples/test_accountable_plan_usbank.csv";
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 20;
const FILTERS = ["All", "Business", "Personal", "Needs review"] as const;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

type Source = "Saved" | "AI" | "Auto";

interface Loaded {
  fileName: string;
  headers: string[];
  rows: string[][];
}

export function ImportTab() {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [mapping, setMapping] = React.useState<Mapping | null>(null);
  const [source, setSource] = React.useState<Source>("Auto");
  const [notes, setNotes] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [confirmed, setConfirmed] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [ai, setAi] = React.useState(false);
  const data = useData();
  // Tags the user has corrected; they beat the rules for that merchant from now on.
  const [learned, setLearned] = React.useState(loadLearned);

  const [aiTagMap, setAiTagMap] = React.useState<Record<string, { tag: Tag; reason: string }>>({});
  const [overrides, setOverrides] = React.useState<Record<number, Tag>>({});
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [shown, setShown] = React.useState(PAGE);

  React.useEffect(() => {
    void aiConfigured().then(setAi);
  }, []);

  const reset = () => {
    setConfirmed(false);
    setAiTagMap({});
    setOverrides({});
    setShown(PAGE);
  };

  const prepare = async (file: Loaded) => {
    reset();
    setLoaded(file);
    setError("");
    const guess = I.guessMapping(file.headers);
    let chosen = guess;
    let from: Source = "Auto";

    const saved = loadMapping(file.headers);
    if (saved) {
      chosen = saved;
      from = "Saved";
    } else if (ai) {
      try {
        setBusy("Asking AI to map the columns…");
        const suggestion = await aiMapping(file.headers, file.rows);
        if (suggestion) {
          chosen = suggestion;
          from = "AI";
        }
      } catch {
        /* fall back to the header-based guess */
      } finally {
        setBusy("");
      }
    }
    // Code has the last word, whoever suggested the mapping.
    const v = I.validateMapping(file.headers, file.rows, chosen);
    setMapping(v.mapping);
    setNotes(v.notes);
    setErrors(v.errors);
    setSource(from);
  };

  const ingest = async (text: string, fileName: string) => {
    const table = I.parseCsv(text);
    if (table.length < 2) return setError("That file has no data rows.");
    await prepare({ fileName, headers: table[0], rows: table.slice(1) });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError("That file is over 5 MB. Export a shorter date range.");
    await ingest(await file.text(), file.name);
  };

  const loadSample = async (messy: boolean) => {
    try {
      const res = await fetch(SAMPLE);
      if (!res.ok) throw new Error("missing");
      const text = await res.text();
      await ingest(messy ? I.makeMessyDemo(text) : text, messy ? "Demo: messy export" : "Sample: US Bank export");
    } catch {
      setError("Couldn't load the sample file.");
    }
  };

  const change = (key: keyof Mapping, value: number) => {
    if (!loaded || !mapping) return;
    const v = I.validateMapping(loaded.headers, loaded.rows, { ...mapping, [key]: value });
    setMapping(v.mapping);
    setNotes(v.notes);
    setErrors(v.errors);
    setConfirmed(false);
  };

  const parsed = React.useMemo(() => (loaded && mapping && errors.length === 0 ? I.applyMapping(loaded.rows, mapping) : null), [loaded, mapping, errors]);

  const confirm = () => {
    if (!loaded || !mapping || errors.length || !parsed) return;
    saveMapping(loaded.headers, mapping);
    setConfirmed(true);
    // Every other tab reads this data, so it is loaded once, here.
    data.publish(parsed.transactions, loaded.fileName, "file");
    logEvent("mapping", `Confirmed the column mapping for ${loaded.fileName}`);
  };

  const rows = React.useMemo(
    () =>
      parsed && confirmed
        ? parsed.transactions.map((t, id) => {
            const auto = I.tagLocal(t);
            const hit = aiTagMap[I.merchantKey(t.name)];
            const base: TagInfo = hit && t.amount < 0 ? { tag: hit.tag, reason: hit.reason, confidence: "high", source: "ai" } : auto;
            const taught = learned[I.merchantKey(t.name)];
            const info: TagInfo = taught ? { tag: taught, reason: "Learned from your correction.", confidence: "high", source: "you" } : base;
            return { id, ...t, info };
          })
        : [],
    [parsed, confirmed, aiTagMap, learned],
  );

  const runAi = async () => {
    if (!parsed) return;
    try {
      setBusy("Tagging with AI…");
      setError("");
      const names = [...new Set(parsed.transactions.filter((t) => t.amount < 0).map((t) => I.merchantKey(t.name)))].filter(Boolean);
      setAiTagMap(await aiTags(names));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI tagging failed.");
    } finally {
      setBusy("");
    }
  };

  const business = rows.filter((r) => r.info.tag === "Business" && r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const personal = rows.filter((r) => r.info.tag === "Personal" && r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const review = rows.filter((r) => r.info.confidence === "low").length;

  const visible = rows.filter(
    (r) =>
      (filter === "All" || (filter === "Needs review" ? r.info.confidence === "low" : r.info.tag === filter)) &&
      (r.name + r.info.reason).toLowerCase().includes(query.trim().toLowerCase()),
  );

  const download = () => {
    const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = rows.map((r) => [r.date, r.name, r.amount.toFixed(2), r.info.tag, r.info.reason, r.info.source].map(esc).join(","));
    const url = URL.createObjectURL(new Blob([["Date,Name,Amount,Tag,Reason,Source", ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tagged-transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const preview = loaded && mapping && errors.length === 0 ? I.applyMapping(loaded.rows.slice(0, 40), mapping).transactions.slice(0, 5) : [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <Card className="lg:col-span-4">
        <CardTitle hint="Any bank CSV: columns can be in any order">Upload</CardTitle>
        <p className="mb-3 truncate text-sm font-semibold text-ink" title={loaded?.fileName}>{loaded?.fileName ?? "No file loaded"}</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
            <FileUp className="size-4" aria-hidden="true" /> Upload CSV
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <DriveImportButton onText={(text, name) => ingest(text, name)} />
          <button type="button" onClick={() => void loadSample(true)} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Demo: messy export
          </button>
          <button type="button" onClick={() => void loadSample(false)} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
            <FlaskConical className="size-4" aria-hidden="true" /> Sample: US Bank
          </button>
        </div>
        {busy && <p role="status" className="mt-3 text-sm font-semibold text-brand">{busy}</p>}
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-500">{error}</p>}
        <p className="mt-4 rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
          {data.source.kind === "none"
            ? "Confirming a mapping loads these transactions into every tab."
            : `In use across the app: ${data.source.label} (${data.source.transactions.length} rows).`}
          {Object.keys(learned).length > 0 && ` You've taught ${Object.keys(learned).length} merchant tag(s); change a row's override to Automatic to forget one.`}
        </p>
        <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-xs font-medium text-gray-500">
          {ai
            ? "AI is on: Claude suggests the column mapping and the tags. Code checks every answer."
            : "AI is off on this site (no ANTHROPIC_API_KEY), so mapping and tags use built-in rules. The same flow runs with AI once the key is added."}
        </p>
      </Card>

      <Card className="min-w-0 md:col-span-1 lg:col-span-8">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle hint={loaded ? `Mapping source: ${source}. Check it, change it if needed, then confirm.` : "Upload a file to see its columns"}>Column mapping</CardTitle>
          {loaded && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">{source}</span>}
        </div>

        {loaded && mapping ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELD_LABELS.map((f) => (
                <label key={f.key} className="block text-sm font-medium text-gray-500">
                  {f.label}
                  <select
                    value={mapping[f.key]}
                    onChange={(e) => change(f.key, Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-2 py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <option value={-1}>— none —</option>
                    {loaded.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                  <span className="mt-0.5 block text-[11px] text-gray-400">{f.hint}</span>
                </label>
              ))}
            </div>

            {notes.map((n) => (
              <p key={n} className="mt-3 flex gap-2 rounded-2xl bg-orange-50 p-3 text-xs font-semibold text-brand">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {n}
              </p>
            ))}
            {errors.map((n) => (
              <p key={n} role="alert" className="mt-3 flex gap-2 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-500">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {n}
              </p>
            ))}

            {preview.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm font-medium">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-gray-400">
                      <th className="pb-2 font-semibold">Preview: Date</th><th className="pb-2 font-semibold">Description</th><th className="pb-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((t, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-2 text-gray-500">{fmtDate(t.date)}</td>
                        <td className="max-w-[260px] truncate py-2 text-ink">{t.name}</td>
                        <td className={`py-2 font-bold ${t.amount > 0 ? "text-emerald-500" : "text-ink"}`}>{t.amount > 0 ? "+" : "−"}{usd(Math.abs(t.amount), 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              onClick={confirm}
              disabled={errors.length > 0 || confirmed}
              className="mt-4 rounded-2xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {confirmed ? "Mapping confirmed and saved" : "Confirm mapping"}
            </button>
          </>
        ) : (
          <p className="text-sm font-medium text-gray-400">The mapping appears here once a file is loaded.</p>
        )}
      </Card>

      {parsed && confirmed && (
        <>
          <div className="grid grid-cols-2 gap-4 md:col-span-2 lg:col-span-12 lg:grid-cols-4">
            <div className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
              <span className="text-sm font-medium text-gray-500">Import summary</span>
              <p className="mt-6 text-3xl font-bold tracking-tight text-ink">{parsed.transactions.length}</p>
              <p className="mt-1 text-xs font-medium text-gray-400">
                read · {parsed.skipped.length} need review · {parsed.duplicates.length} duplicate{parsed.duplicates.length === 1 ? "" : "s"} skipped
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-[32px] bg-gradient-to-br from-orange-500 to-orange-400 p-5 text-white shadow-card">
              <span className="text-sm font-medium text-white/85">Business spending</span>
              <p className="mt-6 truncate text-3xl font-bold tracking-tight">{usd(business, 2)}</p>
              <p className="mt-1 text-xs font-medium text-white/85">{rows.filter((r) => r.info.tag === "Business" && r.amount < 0).length} expenses</p>
            </div>
            <div className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
              <span className="text-sm font-medium text-gray-500">Personal spending</span>
              <p className="mt-6 truncate text-3xl font-bold tracking-tight text-ink">{usd(personal, 2)}</p>
              <p className="mt-1 text-xs font-medium text-gray-400">{rows.filter((r) => r.info.tag === "Personal" && r.amount < 0).length} expenses</p>
            </div>
            <div className="flex flex-col justify-between rounded-[32px] bg-white p-5 shadow-card">
              <span className="text-sm font-medium text-gray-500">Worth a look</span>
              <p className="mt-6 text-3xl font-bold tracking-tight text-ink">{review}</p>
              <p className="mt-1 text-xs font-medium text-gray-400">low-confidence tags</p>
            </div>
          </div>

          {(parsed.skipped.length > 0 || parsed.duplicates.length > 0) && (
            <Card className="md:col-span-2 lg:col-span-12">
              <CardTitle hint="Nothing is dropped silently">Needs review</CardTitle>
              <ul className="space-y-1.5 text-sm font-medium text-gray-500">
                {parsed.skipped.map((s) => (
                  <li key={s.line}><span className="font-semibold text-red-500">Line {s.line}: {s.reason}.</span> <span className="break-all">{s.raw.slice(0, 120)}</span></li>
                ))}
                {parsed.duplicates.map((s) => (
                  <li key={s.line}><span className="font-semibold text-brand">Line {s.line}: exact duplicate, skipped.</span> <span className="break-all">{s.raw.slice(0, 120)}</span></li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="min-w-0 md:col-span-2 lg:col-span-12">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Business or personal</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runAi()}
                  disabled={!ai || !!busy}
                  title={ai ? "Tag every merchant with Claude" : "Add ANTHROPIC_API_KEY on the server to enable"}
                  className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Sparkles className="size-4" aria-hidden="true" /> Tag with AI
                </button>
                <label className="flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500 focus-within:ring-2 focus-within:ring-brand/40">
                  <Search className="size-4" aria-hidden="true" />
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search" aria-label="Search transactions" className="w-28 bg-transparent text-ink outline-none placeholder:text-gray-400" />
                </label>
                <div className="inline-flex rounded-2xl border-2 border-gray-200 p-0.5" role="group" aria-label="Filter">
                  {FILTERS.map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }} className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand ${filter === f ? "bg-zinc-950 text-white" : "text-gray-500 hover:text-ink"}`}>
                      {f}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-3 py-2 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
                  <Download className="size-4" aria-hidden="true" /> Export CSV
                </button>
              </div>
            </div>

            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[820px] text-left text-sm font-medium">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-gray-400">
                    {["Date", "Name", "Amount", "Tag", "Reason", "Source", "Override"].map((h) => (
                      <th key={h} className="pb-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, shown).map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 transition-colors hover:bg-[#F9FAFB]">
                      <td className="whitespace-nowrap py-3 text-gray-500">{fmtDate(r.date)}</td>
                      <td className="max-w-[220px] truncate py-3 text-ink" title={r.name}>{r.name}</td>
                      <td className={`py-3 font-bold ${r.amount > 0 ? "text-emerald-500" : "text-ink"}`}>{r.amount > 0 ? "+" : "−"}{usd(Math.abs(r.amount), 2)}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.info.tag === "Business" ? "bg-blue-50 text-brand-blue" : "bg-gray-100 text-gray-600"}`}>{r.info.tag}</span>
                        {r.info.confidence === "low" && <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-brand">Review</span>}
                      </td>
                      <td className="max-w-[300px] truncate py-3 text-gray-500" title={r.info.reason}>{r.info.reason}</td>
                      <td className="py-3 text-xs font-semibold uppercase text-gray-400">{r.info.source}</td>
                      <td className="py-3">
                        <select
                          aria-label={`Override tag for ${r.name}`}
                          value={learned[I.merchantKey(r.name)] ?? "auto"}
                          onChange={(e) => {
                            const key = I.merchantKey(r.name);
                            const next = { ...learned };
                            if (e.target.value === "auto") delete next[key];
                            else next[key] = e.target.value as Tag;
                            setLearned(next);
                            saveLearned(next);
                            logEvent("tag", e.target.value === "auto" ? `Cleared the taught tag for ${key}` : `Taught: ${key} is ${e.target.value}`);
                          }}
                          className="rounded-xl border-2 border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          <option value="auto">Automatic</option>
                          <option value="Business">Business</option>
                          <option value="Personal">Personal</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!visible.length && <tr><td colSpan={7} className="py-10 text-center text-gray-400">No transactions match.</td></tr>}
                </tbody>
              </table>
            </div>
            {visible.length > shown && (
              <button type="button" onClick={() => setShown((s) => s + PAGE)} className="mt-3 w-full rounded-2xl border-2 border-gray-200 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand">
                Show more ({visible.length - shown} left)
              </button>
            )}
            <p className="mt-4 text-xs font-medium text-gray-400">
              Tags are suggestions for sorting a mixed account. Whether a cost is deductible depends on your situation; confirm with a CPA.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
