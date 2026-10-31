// Which bank a person's live data comes from: the shared test bank (default, so a new account has something to
// explore at once) or a bank they linked themselves. Remembered per account in this browser.
import * as React from "react";
import { scopedStorage } from "@/lib/storage";

export type BankSource = "test" | "own";

const KEY = "bank.source.v1";
const listeners = new Set<() => void>();

export function getBankSource(): BankSource {
  try {
    return scopedStorage.getItem(KEY) === "own" ? "own" : "test";
  } catch {
    return "test";
  }
}

export function setBankSource(source: BankSource) {
  try {
    if (source === "own") scopedStorage.setItem(KEY, "own");
    else scopedStorage.removeItem(KEY);
  } catch {
    /* blocked storage: the choice just won't be remembered */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBankSource(): [BankSource, (s: BankSource) => void] {
  return [React.useSyncExternalStore(subscribe, getBankSource), setBankSource];
}
