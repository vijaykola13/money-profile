// Browser storage that is kept separate for each signed-in Google account. Without sign-in nothing changes:
// keys are used as they are. The user is read once when the page loads, so a sign-in or sign-out reloads the page.

export interface SessionUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  /** Seconds since the epoch, from the verified Google token. */
  exp: number;
}

const USER_KEY = "auth.user.v1";

function readUser(): SessionUser | null {
  try {
    const raw = window.sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as SessionUser;
    return u && typeof u.sub === "string" && u.exp * 1000 > Date.now() ? u : null;
  } catch {
    return null;
  }
}

const USER = readUser();
const PREFIX = USER ? `u:${USER.sub}:` : "";

export const currentUser = (): SessionUser | null => USER;

export function saveSession(user: SessionUser) {
  try {
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* blocked storage: sign-in cannot be remembered */
  }
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export const scopedStorage = {
  getItem: (key: string) => window.localStorage.getItem(PREFIX + key),
  setItem: (key: string, value: string) => window.localStorage.setItem(PREFIX + key, value),
  removeItem: (key: string) => window.localStorage.removeItem(PREFIX + key),
};
