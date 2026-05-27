import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { isRuntimePaused, getOperatorState } from "@/lib/governance/operator";

export interface GovernanceAnomaly {
  id: string;
  anomalyType: "policy_spike" | "enforcement_gap" | "bypass_detected" | "review_backlog";
  detail: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: string;
  resolved: boolean;
}

const ANOMALIES: GovernanceAnomaly[] = [];
const CAP = 200;

export function recordAnomaly(
  anomalyType: GovernanceAnomaly["anomalyType"],
  detail: string,
  severity: GovernanceAnomaly["severity"]
): GovernanceAnomaly {
  const anomaly: GovernanceAnomaly = {
    id: crypto.randomUUID(),
    anomalyType,
    detail,
    severity,
    detectedAt: new Date().toISOString(),
    resolved: false,
  };
  ANOMALIES.push(anomaly);
  if (ANOMALIES.length > CAP) {
    ANOMALIES.splice(0, ANOMALIES.length - CAP);
  }
  return anomaly;
}

export function detectGovernanceAnomalies(): GovernanceAnomaly[] {
  const detected: GovernanceAnomaly[] = [];

  const openCircuits = getAllCircuits().filter((c) => c.state === "open");
  if (openCircuits.length > 3) {
    const anomaly = recordAnomaly(
      "enforcement_gap",
      `${openCircuits.length} circuits are open, indicating widespread enforcement failure`,
      "high"
    );
    detected.push(anomaly);
  }

  const operatorState = getOperatorState();
  if (isRuntimePaused() && operatorState?.runtimePaused) {
    const anomaly = recordAnomaly(
      "bypass_detected",
      "Runtime is paused while operator state confirms pause — potential governance bypass in effect",
      "critical"
    );
    detected.push(anomaly);
  }

  return detected;
}

export function resolveAnomaly(id: string): void {
  const anomaly = ANOMALIES.find((a) => a.id === id);
  if (anomaly) {
    anomaly.resolved = true;
  }
}

export function getActiveAnomalies(
  severity?: GovernanceAnomaly["severity"]
): GovernanceAnomaly[] {
  const active = ANOMALIES.filter((a) => !a.resolved);
  if (severity !== undefined) {
    return active.filter((a) => a.severity === severity);
  }
  return active;
}
