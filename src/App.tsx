import * as React from "react";
import { FinanceBento } from "@/components/ui/finance-bento";
import { Insights } from "@/components/insights";
import { AVATAR, demoData, useFonts } from "./demo";
import { DEMO } from "@/lib/engine";
import { buildCashflow, useBankData } from "@/lib/live-data";

export default function App() {
  useFonts();
  const { plaid } = useBankData();

  // Net worth, allocation, crypto and stocks stay on sample data until accounts and a brokerage are linked.
  const data = React.useMemo(
    () => (plaid ? { ...demoData, cashflow: buildCashflow(plaid.transactions!) } : demoData),
    [plaid],
  );
  const sample = DEMO.personas.find((p) => p.id === "casey")!;
  const transactions = plaid
    ? plaid.transactions!
    : sample.transactions.map((t) => ({ ...t, date: `${t.month}-01`, name: t.category }));

  return (
    <div className="min-h-screen w-full bg-black px-4 py-6 sm:px-6 sm:py-8">
      <FinanceBento
        className="mx-auto max-w-[1320px]"
        data={data}
        title="Overview"
        subtitle={plaid ? `Cash flow: linked bank (Plaid ${plaid.env})` : "Sample data"}
        avatar={AVATAR}
        avatarAlt="Profile"
      />
      <Insights transactions={transactions} accounts={plaid?.accounts ?? []} live={!!plaid} />
    </div>
  );
}
