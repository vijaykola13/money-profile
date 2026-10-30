import * as React from "react";
import { Printer } from "lucide-react";
import { loadAudit, type AuditEvent } from "@/lib/audit";
import { computeBooks } from "@/lib/books";
import { useData } from "@/lib/data-store";
import { importer as I, loadLearned } from "@/lib/importer";
import { loadLog } from "@/lib/quickbooks";
import { loadSaved } from "@/lib/reconcile";
import { Donut } from "@/components/charts";
import { Card, CardTitle, pct, usd } from "./ui";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtStamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-2 text-sm font-medium last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="font-semibold text-ink">{v}</span>
    </div>
  );
}

const section = "print:break-inside-avoid print:shadow-none print:ring-1 print:ring-gray-200";

export function ReportTab() {
  const data = useData();
  const [learned] = React.useState(loadLearned);
  const books = React.useMemo(() => computeBooks(data.source.transactions, { learned }), [data.source.transactions, learned]);
  const reconciliations = React.useMemo(() => loadSaved().history, []);
  const exports = React.useMemo(() => loadLog(), []);
  const audit = React.useMemo<AuditEvent[]>(() => loadAudit(), []);

  if (!books) {
    return (
      <Card>
        <CardTitle hint="Load a bank statement on the Home tab first">Accountant report</CardTitle>
        <p className="text-sm font-medium text-gray-500">The report summarises your loaded transactions, reconciliations and exports.</p>
      </Card>
    );
  }

  // Merchants the tagger was unsure about, biggest spend first, so a person can check them.
  const unsure = new Map<string, { name: string; total: number; count: number; tag: string }>();
  for (const t of data.source.transactions) {
    if (t.amount >= 0) continue;
    const info = I.tagLocal(t);
    if (info.confidence !== "low" || learned[I.merchantKey(t.name)]) continue;
    const key = I.merchantKey(t.name);
    const cur = unsure.get(key) ?? { name: key, total: 0, count: 0, tag: info.tag };
    cur.total += Math.abs(t.amount);
    cur.count += 1;
    unsure.set(key, cur);
  }
  const unsureList = [...unsure.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  const q = books.tax.quarterly;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <Card className={`md:col-span-2 lg:col-span-12 ${section}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">Accountant report</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              {data.source.label} · {fmtDate(books.span.first)} to {fmtDate(books.span.last)} · prepared {fmtDate(today)}
            </p>
          </div>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 print:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <Printer className="size-4" aria-hidden="true" /> Print or save as PDF
          </button>
        </div>
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle>Income and spending</CardTitle>
        <Row k="Transactions" v={String(books.span.count)} />
        <Row k="Deposits (income)" v={usd(books.totalIncome, 2)} />
        <Row k="Total spending" v={usd(books.totalSpending, 2)} />
        <Row k="Business spending (tagged)" v={usd(books.tags.business, 2)} />
        <Row k="Personal spending (tagged)" v={usd(books.tags.personal, 2)} />
        <Row k="Monthly income swing" v={pct(books.incomeSwing * 100, 0)} />
        <div className="mt-4">
          <Donut
            slices={[
              { label: "Business", value: books.tags.business, color: "#3B82F6" },
              { label: "Personal", value: books.tags.personal, color: "#FF6B35" },
            ]}
            centerTop={usd(books.tags.business + books.tags.personal)}
            centerBottom="spending"
            size={130}
            thickness={16}
          />
        </div>
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle hint="A planning view; no money is held or moved">Steady paycheck plan</CardTitle>
        <Row k="Recommended paycheck" v={`${usd(books.recommended)} / month`} />
        <Row k="Tax set-aside rate" v={pct(books.rate * 100, 0)} />
        <Row k="Set aside over the period" v={usd(books.pot.totalSetAside, 2)} />
        <Row k="Holding pot at the end" v={usd(books.pot.endPot, 2)} />
        <Row k="Months short of the paycheck" v={String(books.pot.shortfalls)} />
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle hint={`${books.tax.required.basis}. Federal only.`}>Estimated tax, {books.tax.taxYear}</CardTitle>
        <Row k="Estimated annual tax" v={usd(books.estimate.total, 2)} />
        <Row k="To pay across the year" v={usd(books.tax.required.amount, 2)} />
        {q.map((x) => (
          <Row key={x.id} k={`${x.id}, due ${fmtDate(x.due)}`} v={`${usd(x.amountDue)} · ${x.status}`} />
        ))}
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle hint="Percentages are the plan's settings; confirm them with a CPA">Accountable plan reimbursements</CardTitle>
        <Row k="Home office" v={usd(books.plan.buckets["Home office"], 2)} />
        <Row k="Company car" v={usd(books.plan.buckets["Company car"], 2)} />
        <Row k="Medical" v={usd(books.plan.buckets.Medical, 2)} />
        <Row k="Total reimbursable" v={`${usd(books.plan.total, 2)} · ${books.plan.eligibleCount} transactions`} />
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle hint="Statements ticked to a $0.00 difference and locked">Reconciliations</CardTitle>
        {reconciliations.length ? (
          reconciliations.slice(0, 6).map((h) => (
            <Row key={h.finishedAt} k={fmtStamp(h.finishedAt)} v={`${h.count} transactions to ${usd(h.ending, 2)} (${h.type === "credit" ? "card" : "checking"})`} />
          ))
        ) : (
          <p className="text-sm font-medium text-gray-400">No statement has been reconciled yet.</p>
        )}
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle hint="The tagger was unsure, so a person should check these">Worth a look</CardTitle>
        {unsureList.length ? (
          unsureList.map((u) => <Row key={u.name} k={`${u.name} (${u.count}×, tagged ${u.tag})`} v={usd(u.total, 2)} />)
        ) : (
          <p className="text-sm font-medium text-gray-400">Nothing flagged.</p>
        )}
        {Object.keys(learned).length > 0 && <p className="mt-2 text-xs font-medium text-gray-400">{Object.keys(learned).length} merchant tag(s) were set by you.</p>}
      </Card>

      <Card className={`lg:col-span-6 ${section}`}>
        <CardTitle hint="Files prepared for QuickBooks">Exports</CardTitle>
        {exports.length ? (
          exports.slice(0, 6).map((e) => <Row key={e.at} k={fmtStamp(e.at)} v={`${e.rows} rows · ${e.scope}`} />)
        ) : (
          <p className="text-sm font-medium text-gray-400">Nothing has been exported.</p>
        )}
      </Card>

      <Card className={`md:col-span-2 lg:col-span-12 ${section}`}>
        <CardTitle hint="What was imported, changed and finished in this browser">Activity trail</CardTitle>
        {audit.length ? (
          <ul className="space-y-1.5 text-sm font-medium text-gray-500">
            {audit.slice(0, 14).map((e) => (
              <li key={e.at + e.detail}><span className="text-gray-400">{fmtStamp(e.at)}</span> · <span className="font-semibold uppercase text-ink">{e.type}</span> · {e.detail}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium text-gray-400">No activity recorded yet.</p>
        )}
        <p className="mt-4 text-xs font-medium text-gray-400">
          Prepared from the data you loaded. Tags and the tax and reimbursement figures are estimates for planning and are not tax, legal or investment
          advice; an accountant should confirm them before anything is filed.
        </p>
      </Card>
    </div>
  );
}
