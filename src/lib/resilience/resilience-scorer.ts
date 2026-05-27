import { getOperatorState } from "@/lib/governance/operator";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { getResilienceReport } from "@/lib/simulation/resilience-tester";

export interface ResilienceScore {
  overall: number;
  components: {
    governance: number;
    circuits: number;
    recovery: number;
    effectiveness: number;
  };
  level: "strong" | "adequate" | "fragile" | "critical";
  scoredAt: string;
}

export const SCORE_HISTORY: ResilienceScore[] = [];
const CAP = 100;

export function scoreResilience(): ResilienceScore {
  const opState = getOperatorState();
  const governance = opState ? 100 : 0;

  const allCircuits = getAllCircuits();
  const openCount = allCircuits.filter((c) => c.state === "open").length;
  const totalCircuits = allCircuits.length;
  const circuits = (1 - openCount / Math.max(1, totalCircuits)) * 100;

  const report = getResilienceReport();
  const recovery =
    (report.passed / Math.max(1, report.passed + report.failed)) * 100;

  const effectiveness = calculateEffectiveness().composite;

  const overall = (governance + circuits + recovery + effectiveness) / 4;

  const level: ResilienceScore["level"] =
    overall >= 80
      ? "strong"
      : overall >= 60
      ? "adequate"
      : overall >= 40
      ? "fragile"
      : "critical";

  return {
    overall,
    components: { governance, circuits, recovery, effectiveness },
    level,
    scoredAt: new Date().toISOString(),
  };
}

export function recordResilienceSnapshot(): ResilienceScore {
  const score = scoreResilience();
  SCORE_HISTORY.push(score);
  if (SCORE_HISTORY.length > CAP) SCORE_HISTORY.shift();
  return score;
}

export function getResilienceTrend(): "improving" | "stable" | "degrading" {
  if (SCORE_HISTORY.length < 6) return "stable";
  const recent = SCORE_HISTORY.slice(-3);
  const prior = SCORE_HISTORY.slice(-6, -3);
  const avgRecent = recent.reduce((s, r) => s + r.overall, 0) / 3;
  const avgPrior = prior.reduce((s, r) => s + r.overall, 0) / 3;
  const delta = avgRecent - avgPrior;
  if (delta > 2) return "improving";
  if (delta < -2) return "degrading";
  return "stable";
}
