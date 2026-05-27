/**
 * Ecosystem-wide anomaly detection across the platform.
 */

export interface EcosystemAnomaly {
  id: string;
  anomalyType: "spike" | "drop" | "pattern_shift" | "cascade";
  metric: string;
  observedValue: number;
  expectedValue: number;
  deviationPct: number;
  severity: "low" | "medium" | "high" | "critical";
  affectedTenantCount: number;
  detectedAt: string;
  resolved: boolean;
}

const MAX_ANOMALIES = 200;
const ANOMALIES: EcosystemAnomaly[] = [];

export function detectAnomaly(
  metric: string,
  observed: number,
  expected: number,
  affectedTenantCount: number,
): EcosystemAnomaly | null {
  const deviationPct =
    Math.abs((observed - expected) / Math.max(1, expected)) * 100;

  if (deviationPct < 20) return null;

  const anomalyType: EcosystemAnomaly["anomalyType"] =
    observed > expected * 2
      ? "spike"
      : observed < expected * 0.5
        ? "drop"
        : "pattern_shift";

  const severity: EcosystemAnomaly["severity"] =
    deviationPct > 100
      ? "critical"
      : deviationPct > 50
        ? "high"
        : deviationPct > 30
          ? "medium"
          : "low";

  const anomaly: EcosystemAnomaly = {
    id: crypto.randomUUID(),
    anomalyType,
    metric,
    observedValue: observed,
    expectedValue: expected,
    deviationPct,
    severity,
    affectedTenantCount,
    detectedAt: new Date().toISOString(),
    resolved: false,
  };

  if (ANOMALIES.length >= MAX_ANOMALIES) ANOMALIES.shift();
  ANOMALIES.push(anomaly);
  return anomaly;
}

export function resolveAnomaly(id: string): void {
  const anomaly = ANOMALIES.find((a) => a.id === id);
  if (anomaly) anomaly.resolved = true;
}

export function getActiveAnomalies(): EcosystemAnomaly[] {
  return ANOMALIES.filter((a) => !a.resolved);
}

export function getAnomalySummary(): {
  total: number;
  active: number;
  bySeverity: Record<string, number>;
} {
  const bySeverity: Record<string, number> = {};
  for (const anomaly of ANOMALIES) {
    bySeverity[anomaly.severity] = (bySeverity[anomaly.severity] ?? 0) + 1;
  }
  return {
    total: ANOMALIES.length,
    active: ANOMALIES.filter((a) => !a.resolved).length,
    bySeverity,
  };
}
