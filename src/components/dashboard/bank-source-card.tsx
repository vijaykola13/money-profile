import * as React from "react";
import { Landmark, Link2, Unlink } from "lucide-react";
import { useBankSource, type BankSource } from "@/lib/bank-source";
import { connectBank, disconnectBank, linkStatus, type LinkStatus } from "@/lib/plaid-link";
import { Card } from "./ui";

function Option({ id, active, onSelect, title, children }: { id: BankSource; active: boolean; onSelect: (s: BankSource) => void; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border-2 p-4 transition ${active ? "border-brand bg-emerald-50/40" : "border-gray-200"}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="radio" name="bank-source" checked={active} onChange={() => onSelect(id)} className="mt-1 size-4 accent-[#2E9A58]" />
        <span className="font-semibold text-ink">{title}</span>
      </label>
      <div className="ml-7 mt-1 text-sm font-medium text-gray-500">{children}</div>
    </div>
  );
}

/** Choose between the shared test bank (default for every account) and a bank the person links themselves. */
export function BankSourceCard() {
  const [source, setSource] = useBankSource();
  const [status, setStatus] = React.useState<LinkStatus | null>(null);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");

  const refresh = React.useCallback(() => {
    linkStatus().then(setStatus).catch(() => setStatus({ configured: false, error: "Couldn't reach the bank-linking service." }));
  }, []);
  React.useEffect(refresh, [refresh]);

  const connect = async () => {
    setBusy("Opening Plaid…");
    setMessage("");
    try {
      const out = await connectBank();
      if (out?.linked) {
        setSource("own");
        setMessage(`Linked ${out.institution || "your bank"}. Its data now shows in the live tabs.`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't link the bank.");
    } finally {
      setBusy("");
      refresh();
    }
  };

  const disconnect = async () => {
    setBusy("Disconnecting…");
    setMessage("");
    try {
      await disconnectBank();
      setSource("test");
      setMessage("Disconnected. You're back on the test bank.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy("");
      refresh();
    }
  };

  const testMode = status?.env === "sandbox";
  const canLink = !!status?.configured && status.vault !== false;
  const btn = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <Card className="md:col-span-2 lg:col-span-12">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-brand"><Landmark className="size-5" aria-hidden="true" /></span>
        <div>
          <h3 className="text-lg font-semibold text-ink">Where your bank data comes from</h3>
          <p className="text-sm font-medium text-gray-500">Every account starts on test data, so there is something to explore at once. Link your own bank whenever you like.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Bank data source">
        <Option id="test" active={source === "test"} onSelect={setSource} title="Test data (default)">
          A sandbox bank with sample transactions and paychecks. Nothing to set up, and it is not your money.
        </Option>
        <Option id="own" active={source === "own"} onSelect={setSource} title="My own bank">
          {status?.linked ? (
            <>
              Linked: <span className="font-semibold text-ink">{status.institution || "your bank"}</span>. Read-only.
            </>
          ) : (
            <>Link your bank with Plaid. {testMode ? "This site is in test mode, so Plaid shows test banks (sign in with user_good and pass_good)." : "Your transactions and balances are read-only."}</>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status?.linked ? (
              <button type="button" onClick={() => void disconnect()} disabled={!!busy} className={`${btn} border-2 border-gray-200 text-ink hover:bg-gray-50`}>
                <Unlink className="size-4" aria-hidden="true" /> Disconnect
              </button>
            ) : (
              <button type="button" onClick={() => void connect()} disabled={!!busy || !canLink} className={`${btn} bg-zinc-950 text-white hover:bg-zinc-800`}>
                <Link2 className="size-4" aria-hidden="true" /> {busy || "Connect my bank"}
              </button>
            )}
          </div>
          {status && status.vault === false && (
            <p className="mt-2 text-xs font-semibold text-amber-600">Linking your own bank isn't switched on for this site yet. It needs the server setting VAULT_KEY.</p>
          )}
        </Option>
      </div>
      {message && <p role="status" className="mt-3 text-sm font-semibold text-gray-500">{message}</p>}
    </Card>
  );
}
