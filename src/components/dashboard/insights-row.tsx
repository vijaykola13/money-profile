import { engine } from "@/lib/engine";
import type { Model } from "@/lib/model";
import type { StockData } from "@/lib/stocks";
import { Card, CardTitle, pct, usd } from "./ui";

const BADGE: Record<string, string> = {
  Saver: "bg-emerald-50 text-emerald-600",
  Balanced: "bg-orange-50 text-brand",
  Stretched: "bg-red-50 text-red-500",
  Unknown: "bg-gray-100 text-gray-500",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-2 text-sm font-medium last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="font-semibold text-ink">{v}</span>
    </div>
  );
}

export function InsightsRow({ model, stock }: { model: Model; stock: StockData | null }) {
  const { profile, tax } = model;
  const cash = model.live ? model.balance : null;

  // Uses real orders once a brokerage is connected; otherwise the sample portfolio.
  const events = stock ? engine.detectPanic(stock.bars, stock.trades).filter((e) => e.flagged) : [];

  return (
    <>
      <Card className="lg:col-span-4">
        <CardTitle hint={model.live ? `Based on ${model.months.toFixed(1)} month(s) of linked data` : "Sample data"}>
          Spending profile
        </CardTitle>
        <span className={`mb-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${BADGE[profile.label]}`}>{profile.label}</span>
        <Row k="Savings rate" v={pct(profile.savingsRate * 100)} />
        <Row k="Fixed share of spending" v={pct(profile.fixedShare * 100)} />
        <Row k="Income variability" v={model.months < 3 ? "Needs 3+ months" : pct(profile.incomeVolatility * 100)} />
        {cash !== null && <Row k="Cash on hand" v={usd(cash)} />}
        <p className="mt-3 text-xs font-medium text-gray-400">Saver ≥ 20%, Balanced 5–20%, Stretched below 5% savings rate.</p>
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint="Estimate before withholding">2025 federal tax</CardTitle>
        <Row k="Annualised wages" v={usd(tax.agi)} />
        <Row k="Standard deduction" v={usd(-tax.standardDeduction)} />
        <Row k="Taxable income" v={usd(tax.taxable)} />
        <Row k="Estimated income tax" v={usd(tax.total)} />
        <Row k="Effective rate" v={pct(tax.effectiveRate * 100)} />
        <p className="mt-3 text-xs font-medium text-gray-400">Single filer, federal only. Assumes the income seen continues all year.</p>
      </Card>

      <Card className="lg:col-span-4">
        <CardTitle hint={!stock ? "No brokerage linked" : stock.live ? `From your ${stock.symbol} orders` : "Sample portfolio until a brokerage is linked"}>
          Panic-sell check
        </CardTitle>
        {events.length ? (
          events.map((e) => (
            <div key={e.date} className="rounded-2xl border-l-4 border-red-500 bg-red-50 p-3 text-sm font-medium text-ink">
              <strong>Panic-sell pattern on {e.date}.</strong> Sold {pct(e.soldFraction * 100)} of the position ({e.sold} shares) while
              the price was {pct(e.drawdown * 100)} below its recent peak. Holding to the latest price would be worth{" "}
              {usd(e.heldValue)} versus {usd(e.proceeds)} received ({usd(e.regret)} difference).
            </div>
          ))
        ) : (
          <div className="rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm font-medium text-ink">
            {stock ? "No panic-sell pattern detected." : "Connect a brokerage in Connections to check your trades."}
          </div>
        )}
      </Card>
    </>
  );
}
