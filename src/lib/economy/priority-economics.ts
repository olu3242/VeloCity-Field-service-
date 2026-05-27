export interface SLAContract {
  tenantId: string;
  tier: "standard" | "premium" | "enterprise";
  maxQueueWaitMs: number;
  guaranteedThroughput: number;
  aiCallReservation: number;
  escalationSlaMs: number;
}

export const DEFAULT_SLAS: Record<string, SLAContract["tier"]> = {};

export const TIER_SLAS: Record<
  SLAContract["tier"],
  Omit<SLAContract, "tenantId">
> = {
  standard: {
    tier: "standard",
    maxQueueWaitMs: 30_000,
    guaranteedThroughput: 10,
    aiCallReservation: 20,
    escalationSlaMs: 300_000,
  },
  premium: {
    tier: "premium",
    maxQueueWaitMs: 5_000,
    guaranteedThroughput: 50,
    aiCallReservation: 100,
    escalationSlaMs: 60_000,
  },
  enterprise: {
    tier: "enterprise",
    maxQueueWaitMs: 1_000,
    guaranteedThroughput: 500,
    aiCallReservation: 500,
    escalationSlaMs: 10_000,
  },
};

export function getSLAContract(tenantId: string): SLAContract {
  const tier = DEFAULT_SLAS[tenantId] ?? "standard";
  return { tenantId, ...TIER_SLAS[tier] };
}

export function checkSLACompliance(
  tenantId: string,
  queueWaitMs: number,
  escalationMs?: number
): { compliant: boolean; violations: string[] } {
  const sla = getSLAContract(tenantId);
  const violations: string[] = [];

  if (queueWaitMs > sla.maxQueueWaitMs) {
    violations.push(
      `Queue wait ${queueWaitMs}ms exceeds SLA limit of ${sla.maxQueueWaitMs}ms`
    );
  }
  if (escalationMs !== undefined && escalationMs > sla.escalationSlaMs) {
    violations.push(
      `Escalation time ${escalationMs}ms exceeds SLA limit of ${sla.escalationSlaMs}ms`
    );
  }

  return { compliant: violations.length === 0, violations };
}

export function allocateResources(
  tenantId: string,
  requestedCalls: number
): { granted: number; queued: number; reason: string } {
  const sla = getSLAContract(tenantId);
  const granted = Math.min(requestedCalls, sla.aiCallReservation);
  const queued = requestedCalls - granted;

  return {
    granted,
    queued,
    reason:
      queued > 0 ? "Reservation limit reached" : "Full allocation granted",
  };
}
