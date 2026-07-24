// Session continuity: persist and restore workstream operational context
// across page refreshes, browser restarts, and re-logins.
// sessionStorage for single-session (cleared on tab close).
// localStorage for persistent cross-session state (drafts, filters).
// All guards are client-safe — server-side calls return null/no-op silently.

const SESSION_PREFIX = "velocity:ws:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

export interface SessionContinuityEntry<T = unknown> {
  data: T;
  savedAt: string;
  key: string;
  tenantId: string | null;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function saveWorkstreamState<T>(
  key: string,
  data: T,
  tenantId: string | null = null,
  persistent = false,
): void {
  if (!isClient()) return;
  const entry: SessionContinuityEntry<T> = {
    data,
    savedAt: new Date().toISOString(),
    key,
    tenantId,
  };
  const storage = persistent ? localStorage : sessionStorage;
  try {
    storage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

export function loadWorkstreamState<T>(key: string): T | null {
  if (!isClient()) return null;
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(`${SESSION_PREFIX}${key}`);
      if (!raw) continue;
      const entry = JSON.parse(raw) as SessionContinuityEntry<T>;
      const age = Date.now() - new Date(entry.savedAt).getTime();
      if (age > MAX_AGE_MS) {
        storage.removeItem(`${SESSION_PREFIX}${key}`);
        continue;
      }
      return entry.data;
    } catch {
      continue;
    }
  }
  return null;
}

export function clearWorkstreamState(key: string): void {
  if (!isClient()) return;
  sessionStorage.removeItem(`${SESSION_PREFIX}${key}`);
  localStorage.removeItem(`${SESSION_PREFIX}${key}`);
}

export function clearAllWorkstreamState(): void {
  if (!isClient()) return;
  for (const storage of [sessionStorage, localStorage]) {
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => storage.removeItem(k));
  }
}

// ── Typed helpers for common workstream state ────────────────────────────────

export function saveDispatchFilters(filters: Record<string, unknown>): void {
  saveWorkstreamState("dispatch:filters", filters, null, false);
}

export function loadDispatchFilters(): Record<string, unknown> | null {
  return loadWorkstreamState<Record<string, unknown>>("dispatch:filters");
}

export function saveBookingDraft(
  draft: Record<string, unknown>,
  tenantId: string,
): void {
  saveWorkstreamState("booking:draft", draft, tenantId, true);
}

export function loadBookingDraft(): Record<string, unknown> | null {
  return loadWorkstreamState<Record<string, unknown>>("booking:draft");
}

export function saveInvoiceDraft(
  jobId: string,
  draft: Record<string, unknown>,
): void {
  saveWorkstreamState(`invoice:draft:${jobId}`, draft, null, true);
}

export function loadInvoiceDraft(jobId: string): Record<string, unknown> | null {
  return loadWorkstreamState<Record<string, unknown>>(`invoice:draft:${jobId}`);
}

export function saveWorkflowProgress(
  workflowId: string,
  step: number,
  data: Record<string, unknown>,
): void {
  saveWorkstreamState(`workflow:${workflowId}`, { step, data }, null, false);
}

export function loadWorkflowProgress(
  workflowId: string,
): { step: number; data: Record<string, unknown> } | null {
  return loadWorkstreamState<{ step: number; data: Record<string, unknown> }>(
    `workflow:${workflowId}`,
  );
}

export function saveInspectionState(
  jobId: string,
  state: Record<string, unknown>,
): void {
  saveWorkstreamState(`inspection:${jobId}`, state, null, true);
}

export function loadInspectionState(
  jobId: string,
): Record<string, unknown> | null {
  return loadWorkstreamState<Record<string, unknown>>(`inspection:${jobId}`);
}
