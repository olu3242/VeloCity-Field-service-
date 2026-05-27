export interface DisputeTimelineEntry {
  disputeId: string;
  tenantId: string;
  phase: string;
  action: string;
  performedBy: string;
  notes?: string;
  timestamp: string;
  durationSincePreviousMs?: number;
}

const DISPUTE_TIMELINES: Map<string, DisputeTimelineEntry[]> = new Map<
  string,
  DisputeTimelineEntry[]
>();

export function addDisputeEntry(entry: DisputeTimelineEntry): void {
  const existing = DISPUTE_TIMELINES.get(entry.disputeId) ?? [];
  const last = existing[existing.length - 1];
  const enriched: DisputeTimelineEntry = { ...entry };
  if (last !== undefined) {
    enriched.durationSincePreviousMs =
      new Date(entry.timestamp).getTime() -
      new Date(last.timestamp).getTime();
  }
  existing.push(enriched);
  DISPUTE_TIMELINES.set(entry.disputeId, existing);
}

export function getDisputeTimeline(
  disputeId: string
): DisputeTimelineEntry[] {
  return DISPUTE_TIMELINES.get(disputeId) ?? [];
}

export function getDisputeDurationMs(disputeId: string): number {
  const entries = DISPUTE_TIMELINES.get(disputeId) ?? [];
  if (entries.length < 2) return 0;
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first === undefined || last === undefined) return 0;
  return (
    new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()
  );
}

export function getDisputeSummary(disputeId: string): {
  phases: string[];
  totalDurationMs: number;
  lastAction: string;
} {
  const entries = DISPUTE_TIMELINES.get(disputeId) ?? [];
  const phases = Array.from(new Set(entries.map((e) => e.phase)));
  const totalDurationMs = getDisputeDurationMs(disputeId);
  const last = entries[entries.length - 1];
  return {
    phases,
    totalDurationMs,
    lastAction: last?.action ?? "",
  };
}
