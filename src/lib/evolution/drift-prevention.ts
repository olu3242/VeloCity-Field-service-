export interface DriftAlert {
  id: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  driftPct: number;
  severity: "low" | "medium" | "high";
  detectedAt: string;
  suppressed: boolean;
}

export const ALERTS: DriftAlert[] = [];
const CAP = 100;

export function checkDrift(
  metric: string,
  currentValue: number,
  baselineValue: number,
  threshold = 15
): DriftAlert | null {
  const driftPct =
    baselineValue !== 0
      ? Math.abs((currentValue - baselineValue) / baselineValue) * 100
      : 0;

  if (driftPct <= threshold) return null;

  const severity: DriftAlert["severity"] =
    driftPct > 50 ? "high" : driftPct > 25 ? "medium" : "low";

  const alert: DriftAlert = {
    id: crypto.randomUUID(),
    metric,
    currentValue,
    baselineValue,
    driftPct,
    severity,
    detectedAt: new Date().toISOString(),
    suppressed: false,
  };
  ALERTS.push(alert);
  if (ALERTS.length > CAP) ALERTS.shift();
  return alert;
}

export function suppressAlert(id: string): void {
  const alert = ALERTS.find((a) => a.id === id);
  if (!alert) return;
  alert.suppressed = true;
}

export function getActiveAlerts(): DriftAlert[] {
  return ALERTS.filter((a) => !a.suppressed);
}

export function getDriftSummary(): {
  total: number;
  active: number;
  bySeverity: Record<string, number>;
} {
  const total = ALERTS.length;
  const active = getActiveAlerts().length;
  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const alert of ALERTS) {
    bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
  }
  return { total, active, bySeverity };
}
