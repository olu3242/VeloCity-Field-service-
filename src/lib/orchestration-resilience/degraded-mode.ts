/**
 * Degraded mode handling when AI agents are unavailable.
 */

export type DegradedAction =
  | "queue_for_later"
  | "human_review"
  | "auto_approve"
  | "auto_reject"
  | "use_cache";

export interface DegradedModeConfig {
  eventType: string;
  action: DegradedAction;
  reason: string;
  maxQueueAgeMs: number;
}

const DEGRADED_CONFIGS: Map<string, DegradedModeConfig> = new Map([
  [
    "dispute_opened",
    {
      eventType: "dispute_opened",
      action: "human_review",
      reason: "Disputes require human review during degraded mode",
      maxQueueAgeMs: 3_600_000,
    },
  ],
  [
    "payment_failed",
    {
      eventType: "payment_failed",
      action: "queue_for_later",
      reason: "Payment failures queued for AI retry when service resumes",
      maxQueueAgeMs: 1_800_000,
    },
  ],
  [
    "sla_breach",
    {
      eventType: "sla_breach",
      action: "human_review",
      reason: "SLA breaches require immediate human attention",
      maxQueueAgeMs: 300_000,
    },
  ],
  [
    "tip_submitted",
    {
      eventType: "tip_submitted",
      action: "auto_approve",
      reason: "Tips are auto-approved during degraded mode",
      maxQueueAgeMs: 86_400_000,
    },
  ],
]);

let DEGRADED_MODE_ACTIVE: boolean = false;
let ACTIVATED_AT: number | undefined;
let ACTIVATED_REASON: string | undefined;

export function activateDegradedMode(reason: string): void {
  DEGRADED_MODE_ACTIVE = true;
  ACTIVATED_AT = Date.now();
  ACTIVATED_REASON = reason;
}

export function deactivateDegradedMode(): void {
  DEGRADED_MODE_ACTIVE = false;
  ACTIVATED_AT = undefined;
  ACTIVATED_REASON = undefined;
}

export function isDegradedModeActive(): boolean {
  return DEGRADED_MODE_ACTIVE;
}

export function getDegradedAction(eventType: string): DegradedModeConfig {
  return (
    DEGRADED_CONFIGS.get(eventType) ?? {
      eventType,
      action: "queue_for_later",
      reason: "Default degraded action",
      maxQueueAgeMs: 3_600_000,
    }
  );
}

export function getDegradedStatus(): {
  active: boolean;
  activatedAt?: number;
  reason?: string;
} {
  return {
    active: DEGRADED_MODE_ACTIVE,
    activatedAt: ACTIVATED_AT,
    reason: ACTIVATED_REASON,
  };
}
