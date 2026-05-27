export type DisputePhase =
  | "opened"
  | "evidence_gathering"
  | "review"
  | "resolved"
  | "escalated";

export interface LiveDisputeState {
  disputeId: string;
  tenantId: string;
  phase: DisputePhase;
  jobId?: string;
  amount?: number;
  lastAgentAction?: string;
  openedAt: string;
  updatedAt: string;
  ageMs: number;
}

const LIVE_DISPUTES = new Map<string, LiveDisputeState>();

export function upsertDisputeState(
  state: Omit<LiveDisputeState, "ageMs">
): void {
  const ageMs = Date.now() - new Date(state.openedAt).getTime();
  LIVE_DISPUTES.set(state.disputeId, { ...state, ageMs });
}

export function resolveDispute(disputeId: string): void {
  LIVE_DISPUTES.delete(disputeId);
}

export function getLiveDisputes(tenantId?: string): LiveDisputeState[] {
  const all = Array.from(LIVE_DISPUTES.values());
  return tenantId ? all.filter((d) => d.tenantId === tenantId) : all;
}

export function getDisputeSummary(): {
  total: number;
  byPhase: Record<DisputePhase, number>;
  avgAgeMs: number;
} {
  const all = Array.from(LIVE_DISPUTES.values());

  const byPhase: Record<DisputePhase, number> = {
    opened: 0,
    evidence_gathering: 0,
    review: 0,
    resolved: 0,
    escalated: 0,
  };

  let totalAgeMs = 0;
  for (const d of all) {
    byPhase[d.phase]++;
    totalAgeMs += d.ageMs;
  }

  const avgAgeMs = all.length > 0 ? totalAgeMs / all.length : 0;
  return { total: all.length, byPhase, avgAgeMs };
}
