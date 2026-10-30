import * as React from "react";
import { HardDriveDownload } from "lucide-react";
import { useData } from "@/lib/data-store";
import { driveEnabled, pickDriveFile } from "@/lib/google";

/** Imports a statement from Google Drive (one chosen file). Always shown next to the manual upload. */
export function DriveImportButton({ onText }: { onText?: (text: string, name: string) => void | Promise<void> }) {
  const data = useData();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const run = async () => {
    setMessage("");
    if (!driveEnabled) {
      setMessage("Drive import isn't switched on for this site yet. It needs a Google client ID and API key (see .env.example); until then, upload the file instead.");
      return;
    }
    setBusy(true);
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
        title={driveEnabled ? "Choose a CSV or Google Sheet from your Drive" : "Needs Google settings on the server"}
        className="inline-flex items-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <HardDriveDownload className="size-4" aria-hidden="true" /> {busy ? "Opening Drive…" : "Import from Google Drive"}
      </button>
      {message && <span role="status" className="mt-1 text-xs font-semibold text-gray-500">{message}</span>}
    </span>
  );
}
