// Sign-in with Clerk. Off until VITE_CLERK_PUBLISHABLE_KEY is set, so a local checkout without a key still works.
// The key's secret (CLERK_SECRET_KEY) lets the server functions check each request.
export const CLERK_KEY = (import.meta.env as Record<string, string | undefined>).VITE_CLERK_PUBLISHABLE_KEY || "";
export const authEnabled = !!CLERK_KEY;

// Clerk attaches itself to window once loaded and has no published type for it, so it is used loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function sessionToken(): Promise<string | null> {
  if (!authEnabled) return null;
  try {
    return (await (window as any).Clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

/** fetch() that sends the signed-in user's Clerk token, which the server functions require when sign-in is on. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await sessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
