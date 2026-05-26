export type FraudTriggerType =
  | "payment_pattern_anomaly"
  | "dispute_storm"
  | "identity_mismatch"
  | "velocity_breach"
  | "chargebacks_threshold"
  | "blacklist_match";

export interface FraudAlert {
  id: string;
  tenantId: string;
  triggerType: FraudTriggerType;
  riskScore: number;
  details: Record<string, unknown>;
  triggeredAt: string;
  escalated: boolean;
  escalatedAt?: string;
  resolvedAt?: string;
}

const FRAUD_ALERTS: Map<string, FraudAlert> = new Map();
const MAX_ALERTS = 200;

const TRIGGER_SCORES: Record<FraudTriggerType, number> = {
  payment_pattern_anomaly: 65,
  dispute_storm: 75,
  identity_mismatch: 80,
  velocity_breach: 80,
  chargebacks_threshold: 85,
  blacklist_match: 95,
};

export async function triggerFraudAlert(
  tenantId: string,
  triggerType: FraudTriggerType,
  details: Record<string, unknown>
): Promise<FraudAlert> {
  if (FRAUD_ALERTS.size >= MAX_ALERTS) {
    const oldest = Array.from(FRAUD_ALERTS.keys())[0];
    if (oldest) FRAUD_ALERTS.delete(oldest);
  }

  const id = `fraud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const riskScore = TRIGGER_SCORES[triggerType];

  const alert: FraudAlert = {
    id,
    tenantId,
    triggerType,
    riskScore,
    details,
    triggeredAt: new Date().toISOString(),
    escalated: false,
  };

  FRAUD_ALERTS.set(id, alert);

  if (riskScore >= 70) {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent("agent_run", {
      agentHint: "GABRIEL",
      reason: "fraud_detected",
      alertId: id,
    });
  }

  return alert;
}

export async function escalateFraudAlert(alertId: string): Promise<void> {
  const alert = FRAUD_ALERTS.get(alertId);
  if (alert) {
    alert.escalated = true;
    alert.escalatedAt = new Date().toISOString();
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent("sla_escalate", { alertId, tenantId: alert.tenantId });
  }
}

export function resolveFraudAlert(alertId: string): void {
  const alert = FRAUD_ALERTS.get(alertId);
  if (alert) {
    alert.resolvedAt = new Date().toISOString();
  }
}

export function getActiveFraudAlerts(tenantId?: string): FraudAlert[] {
  return Array.from(FRAUD_ALERTS.values()).filter(
    (a) =>
      !a.resolvedAt &&
      (tenantId === undefined || a.tenantId === tenantId)
  );
}

export function getFraudRiskScore(tenantId: string): number {
  const active = Array.from(FRAUD_ALERTS.values()).filter(
    (a) => !a.resolvedAt && a.tenantId === tenantId
  );
  if (active.length === 0) return 0;
  return Math.max(...active.map((a) => a.riskScore));
}
