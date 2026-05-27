import { randomUUID } from "crypto";

export interface AuditSearchEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  tenantId?: string;
  outcome: "success" | "failure" | "blocked";
  timestamp: string;
  tags: string[];
}

const MAX_AUDIT = 2000;
const AUDIT_ENTRIES: AuditSearchEntry[] = [];

export function indexAuditEntry(
  entry: Omit<AuditSearchEntry, "id">
): AuditSearchEntry {
  const full: AuditSearchEntry = { id: randomUUID(), ...entry };
  AUDIT_ENTRIES.push(full);
  if (AUDIT_ENTRIES.length > MAX_AUDIT) {
    AUDIT_ENTRIES.shift();
  }
  return full;
}

export function searchAudit(query: {
  actor?: string;
  action?: string;
  tenantId?: string;
  outcome?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): AuditSearchEntry[] {
  const limit = query.limit ?? 50;
  const filtered = AUDIT_ENTRIES.filter((e) => {
    if (query.actor !== undefined && e.actor !== query.actor) return false;
    if (query.action !== undefined && e.action !== query.action) return false;
    if (query.tenantId !== undefined && e.tenantId !== query.tenantId)
      return false;
    if (query.outcome !== undefined && e.outcome !== query.outcome)
      return false;
    if (query.fromDate !== undefined && e.timestamp < query.fromDate)
      return false;
    if (query.toDate !== undefined && e.timestamp > query.toDate) return false;
    return true;
  });
  return filtered.slice(-limit);
}

export function getAuditStats(): {
  total: number;
  byOutcome: Record<string, number>;
  byActor: Record<string, number>;
} {
  const byOutcome: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  for (const e of AUDIT_ENTRIES) {
    byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
    byActor[e.actor] = (byActor[e.actor] ?? 0) + 1;
  }
  return { total: AUDIT_ENTRIES.length, byOutcome, byActor };
}

export function getRecentAuditEntries(limit = 20): AuditSearchEntry[] {
  return AUDIT_ENTRIES.slice(-limit);
}
