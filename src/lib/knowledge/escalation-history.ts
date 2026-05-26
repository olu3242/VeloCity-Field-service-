export interface EscalationRecord {
  id: string;
  tenantId: string;
  triggerEvent: string;
  escalatedTo: string;
  reason: string;
  resolvedBy?: string;
  resolutionMs?: number;
  outcome: "resolved" | "pending" | "re_escalated" | "closed_unresolved";
  createdAt: string;
  resolvedAt?: string;
}

const ESCALATION_STORE: Map<string, EscalationRecord> = new Map();

const ESCALATION_CAP = 500;

export function recordEscalation(
  record: Omit<EscalationRecord, "id" | "createdAt">
): EscalationRecord {
  if (ESCALATION_STORE.size >= ESCALATION_CAP) {
    const oldestKey = ESCALATION_STORE.keys().next().value;
    if (oldestKey !== undefined) {
      ESCALATION_STORE.delete(oldestKey);
    }
  }

  const entry: EscalationRecord = {
    ...record,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  ESCALATION_STORE.set(entry.id, entry);
  return entry;
}

export function resolveEscalation(
  id: string,
  resolvedBy: string,
  outcome: EscalationRecord["outcome"]
): void {
  const record = ESCALATION_STORE.get(id);
  if (!record) return;

  const now = new Date().toISOString();
  record.resolvedBy = resolvedBy;
  record.resolvedAt = now;
  record.resolutionMs = Date.now() - new Date(record.createdAt).getTime();
  record.outcome = outcome;
}

export function getEscalationsByTenant(
  tenantId: string,
  limit = 20
): EscalationRecord[] {
  const results: EscalationRecord[] = [];
  for (const rec of Array.from(ESCALATION_STORE.values())) {
    if (rec.tenantId === tenantId) {
      results.push(rec);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function getEscalationPatterns(): {
  triggerEvent: string;
  count: number;
  avgResolutionMs: number;
  mostCommonOutcome: string;
}[] {
  const aggregation = new Map<
    string,
    { count: number; resolutionMsTotal: number; resolvedCount: number; outcomeCounts: Map<string, number> }
  >();

  for (const rec of Array.from(ESCALATION_STORE.values())) {
    const existing = aggregation.get(rec.triggerEvent) ?? {
      count: 0,
      resolutionMsTotal: 0,
      resolvedCount: 0,
      outcomeCounts: new Map<string, number>(),
    };

    existing.count++;
    if (rec.resolutionMs !== undefined) {
      existing.resolutionMsTotal += rec.resolutionMs;
      existing.resolvedCount++;
    }
    existing.outcomeCounts.set(
      rec.outcome,
      (existing.outcomeCounts.get(rec.outcome) ?? 0) + 1
    );

    aggregation.set(rec.triggerEvent, existing);
  }

  return Array.from(aggregation.entries()).map(([triggerEvent, data]) => {
    let mostCommonOutcome = "pending";
    let maxCount = 0;
    for (const [outcome, cnt] of Array.from(data.outcomeCounts.entries())) {
      if (cnt > maxCount) {
        maxCount = cnt;
        mostCommonOutcome = outcome;
      }
    }

    return {
      triggerEvent,
      count: data.count,
      avgResolutionMs:
        data.resolvedCount === 0
          ? 0
          : data.resolutionMsTotal / data.resolvedCount,
      mostCommonOutcome,
    };
  });
}

export function getPendingEscalations(): EscalationRecord[] {
  return Array.from(ESCALATION_STORE.values()).filter(
    (r) => r.outcome === "pending"
  );
}
