/**
 * Drift Detector — detects governance drift patterns from live system state.
 * Cap: 100 drift records. In-memory only.
 */

import { getOperatorState } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";

export interface GovernanceDrift {
  id: string;
  driftType:
    | "policy_bypass"
    | "rule_degradation"
    | "circuit_accumulation"
    | "approval_backlog";
  severity: "low" | "medium" | "high";
  detail: string;
  detectedAt: string;
  resolved: boolean;
}

const DRIFTS_CAP = 100;
export const DRIFTS: GovernanceDrift[] = [];

function addDrift(
  driftType: GovernanceDrift["driftType"],
  severity: GovernanceDrift["severity"],
  detail: string
): GovernanceDrift {
  if (DRIFTS.length >= DRIFTS_CAP) {
    DRIFTS.shift();
  }
  const drift: GovernanceDrift = {
    id: crypto.randomUUID(),
    driftType,
    severity,
    detail,
    detectedAt: new Date().toISOString(),
    resolved: false,
  };
  DRIFTS.push(drift);
  return drift;
}

export function detectDrift(): GovernanceDrift[] {
  const newDrifts: GovernanceDrift[] = [];
  const circuits = getAllCircuits();
  const openCount = circuits.filter((c) => c.state === "open").length;

  // Check: circuit_accumulation — open circuits > 2
  if (openCount > 2) {
    newDrifts.push(
      addDrift(
        "circuit_accumulation",
        "medium",
        `${openCount} circuits are open — circuit accumulation detected`
      )
    );
  }

  // Check: policy_bypass — runtime paused but open circuits exist
  const opState = getOperatorState();
  if (opState?.runtimePaused && openCount > 0) {
    newDrifts.push(
      addDrift(
        "policy_bypass",
        "high",
        `Runtime is paused but ${openCount} open circuit(s) remain — potential policy bypass`
      )
    );
  }

  return newDrifts;
}

export function resolveDrift(id: string): void {
  const drift = DRIFTS.find((d) => d.id === id);
  if (drift) drift.resolved = true;
}

export function getActiveDrifts(): GovernanceDrift[] {
  return DRIFTS.filter((d) => !d.resolved);
}

export function getDriftSummary(): {
  total: number;
  active: number;
  bySeverity: Record<string, number>;
} {
  const active = getActiveDrifts();
  const bySeverity: Record<string, number> = {};
  for (const d of DRIFTS) {
    bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
  }
  return { total: DRIFTS.length, active: active.length, bySeverity };
}
