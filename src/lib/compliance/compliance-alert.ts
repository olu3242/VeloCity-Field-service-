import { randomUUID } from "crypto";

export interface ComplianceAlert {
  id: string;
  alertType: "violation" | "review_required" | "policy_breach" | "expiry_warning";
  policyId?: string;
  tenantId?: string;
  detail: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

const MAX_ALERTS = 500;
const ALERTS: ComplianceAlert[] = [];

export async function createAlert(
  params: Omit<ComplianceAlert, "id" | "createdAt" | "acknowledged">
): Promise<ComplianceAlert> {
  const alert: ComplianceAlert = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    acknowledged: false,
    ...params,
  };
  ALERTS.push(alert);
  if (ALERTS.length > MAX_ALERTS) {
    ALERTS.shift();
  }

  if (params.severity === "critical") {
    const { emitEvent } = await import("@/lib/automation/emitEvent");
    await emitEvent("agent_run", {
      agentHint: "GABRIEL",
      reason: "compliance_violation",
      alertId: alert.id,
      tenantId: params.tenantId,
    });
  }

  return alert;
}

export function acknowledgeAlert(id: string): void {
  const alert = ALERTS.find((a) => a.id === id);
  if (alert !== undefined) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
  }
}

export function getUnacknowledgedAlerts(
  severity?: ComplianceAlert["severity"]
): ComplianceAlert[] {
  return ALERTS.filter((a) => {
    if (a.acknowledged) return false;
    if (severity !== undefined && a.severity !== severity) return false;
    return true;
  });
}

export function getAlertStats(): {
  total: number;
  unacknowledged: number;
  bySeverity: Record<string, number>;
} {
  const bySeverity: Record<string, number> = {};
  let unacknowledged = 0;
  for (const a of ALERTS) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    if (!a.acknowledged) unacknowledged++;
  }
  return { total: ALERTS.length, unacknowledged, bySeverity };
}
