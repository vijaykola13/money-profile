// AI tagging sends merchant names (and, for column mapping, the headings and first three rows of a file) to Anthropic.
// It is off until the person turns it on, and that choice is kept per account in this browser.
import { scopedStorage } from "@/lib/storage";

const KEY = "ai.consent.v1";

export function aiConsentGiven(): boolean {
  try {
    return scopedStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

export function setAiConsent(on: boolean) {
  try {
    if (on) scopedStorage.setItem(KEY, "yes");
    else scopedStorage.removeItem(KEY);
  } catch {
    /* blocked storage: the choice just won't be remembered */
  }
}
