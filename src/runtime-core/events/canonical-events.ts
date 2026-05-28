// All canonical event type strings — extend as needed
export const CANONICAL_EVENTS = {
  // Payment
  PAYMENT_FAILED: "payment_failed",
  PAYMENT_SUCCEEDED: "payment_succeeded",
  PAYOUT_RELEASED: "payout_released",
  PAYOUT_FAILED: "payout_failed",
  // Dispute
  DISPUTE_OPENED: "dispute_opened",
  DISPUTE_RESOLVED: "dispute_resolved",
  DISPUTE_ESCALATED: "dispute_escalated",
  // Job
  JOB_ASSIGNED: "job_assigned",
  JOB_COMPLETED: "job_completed",
  JOB_CANCELLED: "job_cancelled",
  // SLA
  SLA_BREACH: "sla_breach",
  SLA_ESCALATE: "sla_escalate",
  SLA_WARNING: "sla_warn",
  // Agent
  AGENT_RUN: "agent_run",
  AGENT_FAILED: "agent_failed",
  // Compliance
  COMPLIANCE_VIOLATION: "compliance_violation",
  COMPLIANCE_REVIEW_REQUIRED: "compliance_review_required",
  // Runtime
  RUNTIME_PAUSED: "runtime_paused",
  RUNTIME_RESUMED: "runtime_resumed",
  CIRCUIT_OPENED: "circuit_opened",
  CIRCUIT_CLOSED: "circuit_closed",
  // Trust
  TRUST_UPDATED: "trust_updated",
  REPUTATION_CHANGED: "reputation_changed",
  // Federation
  FEDERATION_SYNC: "federation_sync",
  FEDERATION_BREACH: "federation_breach",
} as const

export type CanonicalEventType = typeof CANONICAL_EVENTS[keyof typeof CANONICAL_EVENTS]

// Priority mapping for each canonical event
export const EVENT_PRIORITY: Record<CanonicalEventType, "low" | "normal" | "high" | "critical"> = {
  payment_failed: "critical",
  payment_succeeded: "normal",
  payout_released: "high",
  payout_failed: "critical",
  dispute_opened: "high",
  dispute_resolved: "normal",
  dispute_escalated: "critical",
  job_assigned: "normal",
  job_completed: "normal",
  job_cancelled: "normal",
  sla_breach: "critical",
  sla_escalate: "high",
  sla_warn: "high",
  agent_run: "normal",
  agent_failed: "high",
  compliance_violation: "critical",
  compliance_review_required: "high",
  runtime_paused: "critical",
  runtime_resumed: "normal",
  circuit_opened: "high",
  circuit_closed: "normal",
  trust_updated: "normal",
  reputation_changed: "normal",
  federation_sync: "normal",
  federation_breach: "critical",
}

export function isCanonicalEvent(eventType: string): eventType is CanonicalEventType {
  return Object.values(CANONICAL_EVENTS).includes(eventType as CanonicalEventType)
}

export function getEventPriority(eventType: string): "low" | "normal" | "high" | "critical" {
  if (isCanonicalEvent(eventType)) return EVENT_PRIORITY[eventType]
  return "normal"
}
