// Linking a person's own bank with Plaid Link. The server keeps the access token, encrypted, and never returns it.
import { apiFetch } from "@/lib/auth";

export interface LinkStatus {
  configured: boolean;
  env?: string;
  /** False when the server has no VAULT_KEY, so own-bank linking is off. */
  vault?: boolean;
  linked?: boolean;
  institution?: string;
  error?: string;
}

const FN = "/.netlify/functions/plaid-link";

async function parse(r: Response): Promise<LinkStatus & { link_token?: string }> {
  const body = (await r.json().catch(() => ({}))) as LinkStatus & { link_token?: string };
  if (!r.ok && !body.error) body.error = `The bank-linking service answered ${r.status}.`;
  return body;
}

export async function linkStatus(): Promise<LinkStatus> {
  return parse(await apiFetch(FN));
}

const post = async (action: string, extra: Record<string, unknown> = {}) =>
  parse(await apiFetch(FN, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) }));

// Plaid's script attaches a global with no published types, so it is used loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
let script: Promise<void> | undefined;
function loadPlaid(): Promise<void> {
  script ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Couldn't load Plaid. Check your connection or ad blocker."));
    document.head.appendChild(el);
  });
  return script;
}

/** Opens Plaid Link. Resolves with the new link status, or null if the person closed the window. */
export async function connectBank(): Promise<LinkStatus | null> {
  const made = await post("link-token");
  if (!made.link_token) throw new Error(made.error ?? "Couldn't start bank linking.");
  await loadPlaid();
  return new Promise((resolve, reject) => {
    const handler = (window as any).Plaid.create({
      token: made.link_token,
      onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => {
        post("exchange", { public_token: publicToken, institution: metadata?.institution?.name ?? "" })
          .then((out) => (out.error ? reject(new Error(out.error)) : resolve(out)))
          .catch(reject);
      },
      onExit: (err: { display_message?: string; error_message?: string } | null) =>
        err ? reject(new Error(err.display_message || err.error_message || "Plaid closed with an error.")) : resolve(null),
    });
    handler.open();
  });
}

export async function disconnectBank(): Promise<LinkStatus> {
  return post("unlink");
}
