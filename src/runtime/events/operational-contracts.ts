export const operationalEventTypes = {
  provider: [
    "provider_lead_created",
    "provider_verified",
    "provider_activated",
    "provider_quality_degraded",
  ],
  dispatch: [
    "dispatch_started",
    "provider_assigned",
    "dispatch_retry_triggered",
    "dispatch_failed",
    "dispatch_completed",
  ],
  payment: [
    "payout_pending",
    "payout_processed",
    "payout_failed",
    "refund_processed",
  ],
  enterprise: [
    "sla_timer_started",
    "sla_breach_detected",
    "sla_escalation_started",
  ],
  runtime: [
    "queue_latency_detected",
    "worker_failure_detected",
    "anomaly_detected",
  ],
} as const;

type EventGroup = typeof operationalEventTypes;
export type OperationalEventType = EventGroup[keyof EventGroup][number];

export type OperationalEventContract = {
  type: OperationalEventType;
  tenantId: string;
  subjectType: string;
  subjectId?: string;
  priority?: number;
  payload?: Record<string, unknown>;
  correlationId?: string;
};

export function isOperationalEventType(value: string): value is OperationalEventType {
  return Object.values(operationalEventTypes).some((events) =>
    (events as readonly string[]).includes(value)
  );
}
