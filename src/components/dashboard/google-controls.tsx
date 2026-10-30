import * as React from "react";
import { HardDriveDownload, LogOut } from "lucide-react";
import { useData } from "@/lib/data-store";
import { driveEnabled, pickDriveFile, renderSignInButton, signInEnabled, signOut } from "@/lib/google";
import { currentUser } from "@/lib/storage";

/** Header control: Google's sign-in button, or who is signed in. Renders nothing until sign-in is set up. */
export function AccountMenu() {
  const user = currentUser();
  const host = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!signInEnabled || user || !host.current) return;
    renderSignInButton(host.current, setError).catch((e: unknown) => setError(e instanceof Error ? e.message : "Sign-in is unavailable."));
  }, [user]);

  if (!signInEnabled) return null;
  if (user) {
    return (
      <span className="inline-flex max-w-[260px] items-center gap-2 rounded-full bg-white py-1 pl-1.5 pr-3 text-sm font-semibold shadow-card">
        {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-6 rounded-full" /> : <span className="size-6 rounded-full bg-gray-200" />}
        <span className="truncate" title={user.email}>{user.email}</span>
        <button type="button" onClick={signOut} aria-label="Sign out" className="grid size-6 place-items-center rounded-full text-gray-400 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </span>
    );
  }
  return (
    <div>
      <div ref={host} />
      {error && <p role="alert" className="mt-1 max-w-[260px] text-xs font-semibold text-red-500">{error}</p>}
    </div>
  );
}

/** Imports a statement from Google Drive (one chosen file). Renders nothing until Drive is set up. */
export function DriveImportButton({ onText }: { onText?: (text: string, name: string) => void | Promise<void> }) {
  const data = useData();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  if (!driveEnabled) return null;

  const run = async () => {
    setBusy(true);
    setMessage("");
    try {
      const file = await pickDriveFile();
      if (!file) return;
      if (onText) {
        await onText(file.text, file.name);
        return;
      }
      const r = await data.ingestRaw(file.text, file.name, "file");
      setMessage(r.ok ? `Imported ${r.count} transactions from ${file.name}.` : r.error ?? "Couldn't read that file.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Drive import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <HardDriveDownload className="size-4" aria-hidden="true" /> {busy ? "Opening Drive…" : "Import from Google Drive"}
      </button>
      {message && <span role="status" className="mt-1 text-xs font-semibold text-gray-500">{message}</span>}
    </span>
  );
}
