import * as React from "react";
import { aiConfigured } from "@/lib/importer";
import { useData } from "@/lib/data-store";
import type { useStocks } from "@/lib/stocks";
import { driveEnabled, signInEnabled } from "@/lib/google";
import { currentUser } from "@/lib/storage";
import { Card, usd } from "./ui";

type Stocks = ReturnType<typeof useStocks>;
type State = "connected" | "off" | "checking" | "error";

const DOT: Record<State, string> = {
  connected: "bg-emerald-500",
  off: "bg-gray-300",
  checking: "animate-pulse bg-brand",
  error: "bg-red-500",
};
const LABEL: Record<State, string> = { connected: "Connected", off: "Not connected", checking: "Checking…", error: "Problem" };

function Service({
  name,
  state,
  detail,
  unlocks,
  shares,
  keys,
  children,
}: {
  name: string;
  state: State;
  detail: string;
  unlocks: string;
  shares: string;
  keys?: string[];
  children?: React.ReactNode;
}) {
  return (
    <Card className="lg:col-span-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">{name}</h3>
        <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-xs font-semibold text-ink">
          <span className={`size-2 rounded-full ${DOT[state]}`} /> {LABEL[state]}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-500">{detail}</p>
      {children}
      <dl className="mt-4 space-y-2 text-sm font-medium">
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">What it unlocks</dt><dd className="text-ink">{unlocks}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">What leaves your device</dt><dd className="text-ink">{shares}</dd></div>
        {keys && state !== "connected" && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">To connect, set these on the server</dt>
            <dd className="font-mono text-xs text-ink">{keys.join(", ")}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

export function ConnectionsTab({ stocks }: { stocks: Stocks }) {
  const data = useData();
  const [ai, setAi] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    void aiConfigured().then(setAi);
  }, []);

  const bank: State = data.bankStatus === "connected" ? "connected" : data.bankStatus === "loading" ? "checking" : data.bankStatus === "error" ? "error" : "off";
  const broker: State = stocks.data.live ? "connected" : stocks.loading ? "checking" : stocks.error ? "error" : "off";
  const depository = data.accounts.filter((a) => a.type === "depository");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
      <Card className="md:col-span-2 lg:col-span-12">
        <h2 className="text-lg font-semibold text-ink">Live connections (advanced preview)</h2>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {data.source.kind === "live"
            ? `These tabs run only on live data: ${data.source.label}, ${data.source.transactions.length} transactions.`
            : "Live mode is on, but no bank is linked yet, so there is nothing to show. Connect a bank below."}
        </p>
        <p className="mt-2 text-xs font-medium text-gray-400">
          These run on sandbox test accounts shared by everyone who opens this site. Per-user connections need sign-in, which is on the roadmap.
        </p>
      </Card>

      <Service
        name="Bank (Plaid)"
        state={bank}
        detail={
          bank === "connected"
            ? `${data.source.kind === "live" ? data.source.label : "Linked"} · ${depository.length} account${depository.length === 1 ? "" : "s"}`
            : data.bankMessage || "No bank is connected on this site."
        }
        unlocks="The Overview tab (balance, income, spending, cash flow, cards, activity) and the QuickBooks export of your live transactions."
        shares="Read-only transactions and balances from your bank, through Plaid."
        keys={["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"]}
      >
        {depository.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm font-medium text-gray-500">
            {depository.map((a) => (
              <li key={a.name} className="flex justify-between rounded-xl bg-gray-50 px-3 py-2">
                <span>{a.name}</span>
                <span className="font-semibold text-ink">{a.balance != null ? usd(a.balance, 2) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Service>

      <Service
        name="Brokerage (Alpaca)"
        state={broker}
        detail={
          broker === "connected"
            ? `${stocks.data.sourceLabel} · ${stocks.data.positions.length} position${stocks.data.positions.length === 1 ? "" : "s"}`
            : stocks.error || stocks.notice || "No brokerage is connected on this site."
        }
        unlocks="The Stocks tab: holdings, price charts, stock details and a panic-sell check on your real orders."
        shares="Read-only positions, orders and prices from your brokerage."
        keys={["ALPACA_KEY_ID", "ALPACA_SECRET", "ALPACA_ENV"]}
      />

      <Service
        name="AI (Claude)"
        state={ai === null ? "checking" : ai ? "connected" : "off"}
        detail={ai ? "Claude suggests column mappings and Business or Personal tags; code checks every answer." : "Off: the Import tab uses built-in rules instead."}
        unlocks="Better handling of merchants and file layouts the built-in rules have never seen."
        shares="Merchant names for tagging, and the column headers plus the first three rows of a file for mapping."
        keys={["ANTHROPIC_API_KEY"]}
      />

      <Service
        name="Google (sign-in and Drive)"
        state={signInEnabled ? "connected" : "off"}
        detail={
          !signInEnabled
            ? "Not set up on this site."
            : currentUser()
              ? `Signed in as ${currentUser()!.email}. Your data is kept separate for this account in this browser.`
              : `Sign-in is available${driveEnabled ? ", and Drive import is on" : ""}.`
        }
        unlocks="Sign in with Google, keep each account's data separate in this browser, and import a statement from Google Drive."
        shares="Your Google name and email at sign-in. For Drive, only the one file you pick (the drive.file permission)."
        keys={["VITE_GOOGLE_CLIENT_ID", "VITE_GOOGLE_API_KEY", "GOOGLE_CLIENT_ID"]}
      />

      <Service
        name="QuickBooks"
        state="off"
        detail="Direct sync isn't built. The QuickBooks tab exports a CSV you upload in QuickBooks Online, and logs each export."
        unlocks="A one-way push of transactions into a QuickBooks company, once developer credentials and sign-in are added."
        shares="Nothing yet."
      />
    </div>
  );
}
