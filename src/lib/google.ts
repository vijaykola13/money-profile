// Google sign-in (Google Identity Services) and Drive import (Google Picker with the drive.file scope).
// Both are off until the public client settings exist, so a site without them looks and works as before.
//
// Page settings (public, set at build time): VITE_GOOGLE_CLIENT_ID, and for Drive also VITE_GOOGLE_API_KEY
// (and optionally VITE_GOOGLE_APP_ID). The server needs GOOGLE_CLIENT_ID to verify sign-ins.
import { clearSession, saveSession, type SessionUser } from "@/lib/storage";

const env = import.meta.env as Record<string, string | undefined>;
export const GOOGLE = {
  clientId: env.VITE_GOOGLE_CLIENT_ID || "",
  apiKey: env.VITE_GOOGLE_API_KEY || "",
  appId: env.VITE_GOOGLE_APP_ID || "",
};
export const signInEnabled = !!GOOGLE.clientId;
export const driveEnabled = !!GOOGLE.clientId && !!GOOGLE.apiKey;

const MAX_BYTES = 5 * 1024 * 1024;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

// The Google scripts attach globals with no published types, so they are used loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = () => (window as any).google;

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("Couldn't load a Google script. Check your connection or ad blocker."));
      document.head.appendChild(el);
    });
    scripts.set(src, p);
  }
  return p;
}

/** Draws Google's own sign-in button. `onUser` runs after our server has verified the sign-in. */
export async function renderSignInButton(host: HTMLElement, onError: (message: string) => void) {
  await loadScript("https://accounts.google.com/gsi/client");
  g().accounts.id.initialize({
    client_id: GOOGLE.clientId,
    callback: async (response: { credential?: string }) => {
      try {
        if (!response.credential) throw new Error("Google didn't return a sign-in.");
        const res = await fetch("/.netlify/functions/auth-google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const out = (await res.json()) as { configured?: boolean; user?: SessionUser; error?: string };
        if (out.configured === false) throw new Error("Sign-in isn't set up on the server yet (GOOGLE_CLIENT_ID).");
        if (!res.ok || !out.user) throw new Error(out.error ?? "Sign-in failed.");
        saveSession(out.user);
        window.location.reload(); // storage is scoped to the user when the page loads
      } catch (e) {
        onError(e instanceof Error ? e.message : "Sign-in failed.");
      }
    },
  });
  host.innerHTML = "";
  g().accounts.id.renderButton(host, { theme: "outline", size: "large", shape: "pill", text: "signin_with" });
}

export function signOut() {
  try {
    g()?.accounts?.id?.disableAutoSelect?.();
  } catch {
    /* ignore */
  }
  clearSession();
  window.location.reload();
}

async function accessToken(): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise<string>((resolve, reject) => {
    const client = g().accounts.oauth2.initTokenClient({
      client_id: GOOGLE.clientId,
      scope: SCOPE,
      callback: (r: { access_token?: string; error?: string }) =>
        r.access_token ? resolve(r.access_token) : reject(new Error(r.error ? `Google said: ${r.error}` : "Google access was not granted.")),
      error_callback: () => reject(new Error("The Google permission window was closed.")),
    });
    client.requestAccessToken();
  });
}

interface Picked {
  id: string;
  name: string;
  mimeType: string;
}

function pick(token: string): Promise<Picked | null> {
  return new Promise((resolve, reject) => {
    const gapi = (window as any).gapi;
    gapi.load("picker", {
      callback: () => {
        const view = new (g().picker.DocsView)(g().picker.ViewId.DOCS)
          .setMimeTypes("text/csv,application/vnd.google-apps.spreadsheet")
          .setSelectFolderEnabled(false);
        const builder = new (g().picker.PickerBuilder)()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(GOOGLE.apiKey)
          .setCallback((data: { action: string; docs?: Picked[] }) => {
            if (data.action === g().picker.Action.PICKED && data.docs?.[0]) resolve(data.docs[0]);
            else if (data.action === g().picker.Action.CANCEL) resolve(null);
          });
        if (GOOGLE.appId) builder.setAppId(GOOGLE.appId);
        builder.build().setVisible(true);
      },
      onerror: () => reject(new Error("Couldn't load the Google file picker.")),
    });
  });
}

/** Lets the user choose a CSV or Google Sheet in Drive and returns its text. Only the chosen file is readable. */
export async function pickDriveFile(): Promise<{ name: string; text: string } | null> {
  if (!driveEnabled) throw new Error("Drive import isn't set up on this site.");
  await loadScript("https://apis.google.com/js/api.js");
  const token = await accessToken();
  const file = await pick(token);
  if (!file) return null;

  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
  const url = file.mimeType === "application/vnd.google-apps.spreadsheet" ? `${base}/export?mimeType=text/csv` : `${base}?alt=media`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive couldn't open that file (${res.status}).`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("That file is over 5 MB. Choose a shorter date range.");
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error("That file is over 5 MB. Choose a shorter date range.");
  return { name: file.name, text };
}
