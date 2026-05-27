/**
 * Predictive business alerts.
 * Generates forward-looking alerts for capacity, cost, and risk signals.
 */

import { randomUUID } from "crypto";

export interface PredictiveAlert {
  id: string;
  alertType: "capacity" | "cost_overrun" | "sla_risk" | "churn_risk" | "fraud_risk";
  title: string;
  prediction: string;
  confidence: number;
  impactLevel: "low" | "medium" | "high" | "critical";
  recommendedAction: string;
  generatedAt: string;
  acknowledged: boolean;
}

const CAP = 200;
export const ALERTS: PredictiveAlert[] = [];

function pushAlert(alert: PredictiveAlert): void {
  ALERTS.push(alert);
  if (ALERTS.length > CAP) {
    ALERTS.shift();
  }
}

export function generateCapacityAlert(
  queueDepth: number,
  workerCount: number
): PredictiveAlert | null {
  const capacity = workerCount * 50;
  const ratio = queueDepth / Math.max(1, capacity);

  if (ratio < 0.7) return null;

  const confidence = Math.min(0.95, queueDepth / Math.max(1, workerCount * 100));
  const impactLevel: PredictiveAlert["impactLevel"] =
    ratio > 0.9 ? "critical" : ratio > 0.8 ? "high" : "medium";

  const alert: PredictiveAlert = {
    id: randomUUID(),
    alertType: "capacity",
    title: "Worker Capacity Saturation Predicted",
    prediction: `Queue depth ${queueDepth} against ${workerCount} workers (ratio ${ratio.toFixed(2)}) indicates capacity saturation.`,
    confidence,
    impactLevel,
    recommendedAction: "Scale worker pool or shed non-critical queue items before saturation.",
    generatedAt: new Date().toISOString(),
    acknowledged: false,
  };

  pushAlert(alert);
  return alert;
}

export function generateCostAlert(
  projectedCostUsd: number,
  budgetUsd: number
): PredictiveAlert | null {
  if (projectedCostUsd < budgetUsd * 0.8) return null;

  const overagePct = ((projectedCostUsd - budgetUsd) / Math.max(0.01, budgetUsd)) * 100;
  const impactLevel: PredictiveAlert["impactLevel"] =
    overagePct > 50 ? "critical" : overagePct > 20 ? "high" : overagePct > 0 ? "medium" : "low";

  const alert: PredictiveAlert = {
    id: randomUUID(),
    alertType: "cost_overrun",
    title: "Projected Cost Budget Overrun",
    prediction: `Projected cost $${projectedCostUsd.toFixed(2)} ${overagePct > 0 ? "exceeds" : "approaches"} budget $${budgetUsd.toFixed(2)} by ${Math.abs(overagePct).toFixed(1)}%.`,
    confidence: 0.85,
    impactLevel,
    recommendedAction: "Review high-cost agent workflows and apply cost caps or throttling.",
    generatedAt: new Date().toISOString(),
    acknowledged: false,
  };

  pushAlert(alert);
  return alert;
}

export function getActiveAlerts(
  type?: PredictiveAlert["alertType"]
): PredictiveAlert[] {
  return ALERTS.filter(
    (a) => !a.acknowledged && (type === undefined || a.alertType === type)
  );
}

export function acknowledgeAlert(id: string): void {
  const alert = ALERTS.find((a) => a.id === id);
  if (alert) {
    alert.acknowledged = true;
  }
}
