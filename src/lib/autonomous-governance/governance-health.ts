/**
 * Governance Health — scores overall governance health from live checks.
 * Cap: 100 history snapshots.
 */

import { getOperatorState, isRuntimePaused } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";

export interface GovernanceHealthReport {
  score: number;
  level: "healthy" | "degraded" | "critical";
  checks: { name: string; passed: boolean; weight: number }[];
  generatedAt: string;
}

const HEALTH_HISTORY_CAP = 100;
export const HEALTH_HISTORY: GovernanceHealthReport[] = [];

export function scoreGovernanceHealth(): GovernanceHealthReport {
  const checks: { name: string; passed: boolean; weight: number }[] = [
    {
      name: "operator-state",
      passed: getOperatorState() !== null && getOperatorState() !== undefined,
      weight: 0.25,
    },
    {
      name: "runtime-not-paused",
      passed: !isRuntimePaused(),
      weight: 0.25,
    },
    {
      name: "circuits-closed",
      passed: getAllCircuits().filter((c) => c.state === "open").length < 3,
      weight: 0.25,
    },
    {
      name: "resilience-passing",
      passed: getResilienceReport().passed > 0,
      weight: 0.25,
    },
  ];

  const score =
    checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0) * 100;

  const level: GovernanceHealthReport["level"] =
    score >= 75 ? "healthy" : score >= 50 ? "degraded" : "critical";

  return { score, level, checks, generatedAt: new Date().toISOString() };
}

export function recordHealthSnapshot(): GovernanceHealthReport {
  if (HEALTH_HISTORY.length >= HEALTH_HISTORY_CAP) {
    HEALTH_HISTORY.shift();
  }
  const report = scoreGovernanceHealth();
  HEALTH_HISTORY.push(report);
  return report;
}

export function getHealthTrend(): "improving" | "stable" | "degrading" {
  if (HEALTH_HISTORY.length < 6) return "stable";
  const recent = HEALTH_HISTORY.slice(-3);
  const prior = HEALTH_HISTORY.slice(-6, -3);
  const avgRecent =
    recent.reduce((s, r) => s + r.score, 0) / recent.length;
  const avgPrior =
    prior.reduce((s, r) => s + r.score, 0) / prior.length;
  if (avgRecent > avgPrior + 5) return "improving";
  if (avgRecent < avgPrior - 5) return "degrading";
  return "stable";
}
