// Browser storage that is kept separate for each signed-in account (Clerk). Without sign-in nothing changes:
// keys are used as they are. The auth gate sets the user before the app renders, and a sign-in or sign-out
// reloads the page, so the prefix never changes while the app is running.

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

let USER: SessionUser | null = null;
let PREFIX = "";

export const currentUser = (): SessionUser | null => USER;

export function setStorageUser(user: SessionUser | null) {
  USER = user;
  PREFIX = user ? `u:${user.id}:` : "";
}

export const scopedStorage = {
  getItem: (key: string) => window.localStorage.getItem(PREFIX + key),
  setItem: (key: string, value: string) => window.localStorage.setItem(PREFIX + key, value),
  removeItem: (key: string) => window.localStorage.removeItem(PREFIX + key),
};
