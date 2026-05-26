/**
 * Tenant health scoring from runtime signals.
 */

export type TenantHealthGrade = "A" | "B" | "C" | "D" | "F";

export interface TenantHealthSnapshot {
  tenantId: string;
  automationScore: number;
  paymentScore: number;
  slaScore: number;
  reliabilityScore: number;
  compositeScore: number;
  grade: TenantHealthGrade;
  capturedAt: string;
  recommendations: string[];
}

const HISTORY_CAP = 10;
const HEALTH_HISTORY = new Map<string, TenantHealthSnapshot[]>();

function toGrade(score: number): TenantHealthGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function scoreTenantHealth(
  tenantId: string,
  metrics: {
    automationRate: number;
    paymentSuccessRate: number;
    slaComplianceRate: number;
    workflowSuccessRate: number;
  }
): TenantHealthSnapshot {
  const automationScore = metrics.automationRate * 100;
  const paymentScore = metrics.paymentSuccessRate * 100;
  const slaScore = metrics.slaComplianceRate * 100;
  const reliabilityScore = metrics.workflowSuccessRate * 100;
  const compositeScore =
    automationScore * 0.25 +
    paymentScore * 0.25 +
    slaScore * 0.25 +
    reliabilityScore * 0.25;

  const recommendations: string[] = [];
  if (automationScore < 70)
    recommendations.push("Improve automation coverage to reduce manual interventions.");
  if (paymentScore < 70)
    recommendations.push("Investigate payment failures and retry logic to increase success rate.");
  if (slaScore < 70)
    recommendations.push("Review SLA breach patterns and adjust scheduling or escalation paths.");
  if (reliabilityScore < 70)
    recommendations.push("Audit workflow failure causes and harden error handling.");

  const snapshot: TenantHealthSnapshot = {
    tenantId,
    automationScore,
    paymentScore,
    slaScore,
    reliabilityScore,
    compositeScore,
    grade: toGrade(compositeScore),
    capturedAt: new Date().toISOString(),
    recommendations,
  };

  const history = HEALTH_HISTORY.get(tenantId) ?? [];
  history.push(snapshot);
  if (history.length > HISTORY_CAP) history.shift();
  HEALTH_HISTORY.set(tenantId, history);

  return snapshot;
}

export function getHealthHistory(tenantId: string): TenantHealthSnapshot[] {
  return HEALTH_HISTORY.get(tenantId) ?? [];
}

export function getHealthTrend(
  tenantId: string
): "improving" | "stable" | "degrading" {
  const history = HEALTH_HISTORY.get(tenantId) ?? [];
  if (history.length < 2) return "stable";
  const prev = history[history.length - 2].compositeScore;
  const curr = history[history.length - 1].compositeScore;
  const delta = curr - prev;
  if (delta > 5) return "improving";
  if (delta < -5) return "degrading";
  return "stable";
}

export function getUnhealthyTenants(threshold = 70): TenantHealthSnapshot[] {
  const results: TenantHealthSnapshot[] = [];
  for (const snapshots of Array.from(HEALTH_HISTORY.values())) {
    if (snapshots.length === 0) continue;
    const latest = snapshots[snapshots.length - 1];
    if (latest.compositeScore < threshold) results.push(latest);
  }
  return results;
}
