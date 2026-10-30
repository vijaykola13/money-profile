import { scopedStorage } from "@/lib/storage";
// A small activity trail kept in this browser: what was imported, changed and finished, and when.
// It feeds the accountant report. It never leaves the device.

export type AuditType = "import" | "mapping" | "tag" | "reconcile" | "export" | "data";

export interface AuditEvent {
  at: string;
  type: AuditType;
  detail: string;
}

const STORE = "audit.v1";
const MAX = 200;

export function loadAudit(): AuditEvent[] {
  try {
    const raw = JSON.parse(scopedStorage.getItem(STORE) ?? "[]") as AuditEvent[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function logEvent(type: AuditType, detail: string) {
  try {
    const next = [{ at: new Date().toISOString(), type, detail }, ...loadAudit()].slice(0, MAX);
    scopedStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    /* storage unavailable: the trail just won't be kept */
  }
}

export function clearAudit() {
  try {
    scopedStorage.removeItem(STORE);
  } catch {
    /* ignore */
  }
}
