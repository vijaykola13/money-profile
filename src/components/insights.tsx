import { getDemo, getTax, engine, type Txn } from "@/lib/engine";
import { monthsCovered, type Account } from "@/lib/live-data";

const usd = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const pct = (n: number) => (n * 100).toFixed(1) + "%";

const BADGE: Record<string, string> = {
  Saver: "bg-emerald-500",
  Balanced: "bg-amber-500",
  Stretched: "bg-rose-500",
  Unknown: "bg-zinc-500",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-white/10 py-1.5 text-sm last:border-0">
      <span className="text-white/60">{k}</span>
      <span className="font-mono tabular-nums">{v}</span>
    </div>
  );
}

export function Insights({ transactions, accounts, live }: { transactions: Txn[]; accounts: Account[]; live: boolean }) {
  const profile = engine.profile(transactions);
  const months = monthsCovered(transactions);
  // Annualised from the history we have; withholding is unknown, so this is tax before withholding.
  const tax = engine.estimateTax(
    { filingStatus: "single", wages: Math.round((profile.income / months) * 12), withholding: null },
    getTax(),
  );
  const cash = accounts
    .filter((a) => a.type === "depository" && a.balance != null)
    .reduce((s, a) => s + (a.balance ?? 0), 0);

  // Order history comes from the brokerage; until Alpaca is connected, use the sample portfolio.
  const sample = getDemo().personas.find((p) => p.id === "casey")!;
  const events = engine.detectPanic(getDemo().prices, sample.trades).filter((e) => e.flagged);

  return (
    <div className="mx-auto mt-4 grid max-w-[1320px] gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Spending profile">
        <span className={`mb-4 inline-block rounded-full px-3 py-0.5 text-sm font-semibold ${BADGE[profile.label]}`}>
          {profile.label}
        </span>
        <Row k="Take-home income" v={usd(profile.income)} />
        <Row k="Expenses" v={usd(profile.spent)} />
        <Row k="Savings rate" v={pct(profile.savingsRate)} />
        <Row k="Fixed share of spending" v={pct(profile.fixedShare)} />
        {live && accounts.length > 0 && <Row k="Cash on hand" v={usd(cash)} />}
        <p className="mt-3 text-xs text-white/40">
          {live ? `Based on ${months.toFixed(1)} month(s) of linked bank data.` : "Sample data."} Saver ≥ 20% savings rate,
          Balanced 5–20%, Stretched below 5%.
        </p>
      </Card>

      <Card title="2025 federal tax estimate">
        <Row k="Annualised wages" v={usd(tax.agi)} />
        <Row k="Standard deduction" v={usd(-tax.standardDeduction)} />
        <Row k="Taxable income" v={usd(tax.taxable)} />
        <Row k="Estimated income tax" v={usd(tax.total)} />
        <Row k="Effective rate" v={pct(tax.effectiveRate)} />
        <p className="mt-3 text-xs text-white/40">
          Estimate before withholding, single filer, federal only. Assumes the income seen continues for the full year.
        </p>
      </Card>

      <Card title="Panic-sell check">
        {events.length ? (
          events.map((e) => (
            <div key={e.date} className="rounded-xl border-l-4 border-rose-500 bg-rose-500/10 p-3 text-sm">
              <strong>Panic-sell pattern on {e.date}.</strong> Sold {pct(e.soldFraction)} of the position ({e.sold}{" "}
              shares) while the price was {pct(e.drawdown)} below its recent peak. Holding to the latest price would be
              worth {usd(e.heldValue)} versus {usd(e.proceeds)} received ({usd(e.regret)} difference).
            </div>
          ))
        ) : (
          <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-500/10 p-3 text-sm">
            No panic-sell pattern detected.
          </div>
        )}
        <p className="mt-3 text-xs text-white/40">Sample portfolio. Connect a brokerage to check your own trades.</p>
      </Card>
    </div>
  );
}
