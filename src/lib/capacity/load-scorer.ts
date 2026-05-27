import { getCurrentStatus } from "@/lib/realtime/queue-stream";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { getWorkerHealth } from "@/lib/orchestration/distributed-fabric";

export interface LoadScore {
  queueScore: number; // 0-100: queue pressure
  workerScore: number; // 0-100: worker availability
  aiScore: number; // 0-100: AI circuit health
  compositeScore: number; // weighted: queue 40%, worker 40%, ai 20%
  loadLevel: "low" | "moderate" | "high" | "critical";
  generatedAt: string;
}

const LOAD_HISTORY: LoadScore[] = [];
const LOAD_HISTORY_CAP = 100;

function resolveLoadLevel(
  composite: number
): "low" | "moderate" | "high" | "critical" {
  if (composite > 80) return "low";
  if (composite > 60) return "moderate";
  if (composite > 40) return "high";
  return "critical";
}

export function scoreLoad(): LoadScore {
  const queueStatus = getCurrentStatus();
  const openCircuits = getAllCircuits().filter((c) => c.state === "open").length;
  const health = getWorkerHealth();
  const activeWorkers = Math.max(1, health.idle + health.processing);

  const queueScore = Math.max(
    0,
    100 - (queueStatus.queueDepth / 150) * 100
  );
  const workerScore = Math.min(100, (activeWorkers / 4) * 100);
  const aiScore = Math.max(0, 100 - openCircuits * 20);
  const compositeScore = queueScore * 0.4 + workerScore * 0.4 + aiScore * 0.2;
  const loadLevel = resolveLoadLevel(compositeScore);

  return {
    queueScore,
    workerScore,
    aiScore,
    compositeScore,
    loadLevel,
    generatedAt: new Date().toISOString(),
  };
}

export function recordLoad(): LoadScore {
  const score = scoreLoad();
  LOAD_HISTORY.push(score);
  if (LOAD_HISTORY.length > LOAD_HISTORY_CAP) {
    LOAD_HISTORY.shift();
  }
  return score;
}

export function getLoadHistory(limit = 20): LoadScore[] {
  return LOAD_HISTORY.slice(-limit);
}
