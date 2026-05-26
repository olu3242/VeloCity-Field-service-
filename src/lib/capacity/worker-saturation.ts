import { getCurrentStatus } from "@/lib/realtime/queue-stream";
import { getWorkerHealth } from "@/lib/orchestration/distributed-fabric";

export type SaturationLevel = "healthy" | "elevated" | "saturated" | "critical";

export interface SaturationReport {
  workerCount: number;
  queueDepth: number;
  eventsPerWorker: number;
  saturationLevel: SaturationLevel;
  utilizationPct: number; // 0-100
  recommendation: string;
}

const HISTORY: SaturationReport[] = [];
const HISTORY_CAP = 10;

function getSaturationLevel(utilizationPct: number): SaturationLevel {
  if (utilizationPct < 40) return "healthy";
  if (utilizationPct < 70) return "elevated";
  if (utilizationPct < 90) return "saturated";
  return "critical";
}

function getRecommendation(level: SaturationLevel): string {
  switch (level) {
    case "healthy":
      return "System operating normally. No action required.";
    case "elevated":
      return "Worker load is elevated. Monitor closely and consider pre-scaling.";
    case "saturated":
      return "Workers are near capacity. Scale up workers immediately.";
    case "critical":
      return "Critical saturation. Add workers urgently and throttle incoming load.";
  }
}

export function assessSaturation(): SaturationReport {
  const status = getCurrentStatus();
  const health = getWorkerHealth();
  const activeWorkers = Math.max(1, health.idle + health.processing);
  const eventsPerWorker = status.queueDepth / activeWorkers;
  const utilizationPct = Math.min(100, (status.queueDepth / (activeWorkers * 50)) * 100);
  const saturationLevel = getSaturationLevel(utilizationPct);

  return {
    workerCount: activeWorkers,
    queueDepth: status.queueDepth,
    eventsPerWorker,
    saturationLevel,
    utilizationPct,
    recommendation: getRecommendation(saturationLevel),
  };
}

export function recordSaturation(): SaturationReport {
  const report = assessSaturation();
  HISTORY.push(report);
  if (HISTORY.length > HISTORY_CAP) {
    HISTORY.shift();
  }
  return report;
}

export function getSaturationHistory(): SaturationReport[] {
  recordSaturation();
  return HISTORY.slice(-HISTORY_CAP);
}
