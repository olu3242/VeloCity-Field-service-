import { getCurrentStatus } from "@/lib/realtime/queue-stream";
import { calculateEffectiveness } from "@/lib/economy/telemetry";

export interface ThroughputSnapshot {
  timestamp: string;
  eventsPerMinute: number;
  queueDepth: number;
  activeWorkers: number;
  failureRate: number;
  aiCallsPerMinute: number;
  effectivenessScore: number;
}

const SNAPSHOTS: ThroughputSnapshot[] = [];
const CAP = 100;

export function captureThroughputSnapshot(): ThroughputSnapshot {
  const status = getCurrentStatus();
  const effectiveness = calculateEffectiveness();

  const snapshot: ThroughputSnapshot = {
    timestamp: new Date().toISOString(),
    eventsPerMinute: status.processingRate,
    queueDepth: status.queueDepth,
    activeWorkers: status.activeWorkers,
    failureRate: status.failureRate,
    aiCallsPerMinute: 0,
    effectivenessScore: effectiveness.composite,
  };

  SNAPSHOTS.push(snapshot);
  if (SNAPSHOTS.length > CAP) SNAPSHOTS.shift();

  return snapshot;
}

export function getRecentSnapshots(limit = 20): ThroughputSnapshot[] {
  return SNAPSHOTS.slice(-limit);
}

export function getThroughputTrend(): "improving" | "stable" | "degrading" {
  if (SNAPSHOTS.length < 10) return "stable";

  const recent = SNAPSHOTS.slice(-5);
  const previous = SNAPSHOTS.slice(-10, -5);

  const avgRecent = recent.reduce((s, snap) => s + snap.eventsPerMinute, 0) / recent.length;
  const avgPrevious = previous.reduce((s, snap) => s + snap.eventsPerMinute, 0) / previous.length;

  if (avgPrevious === 0) return "stable";
  if (avgRecent > avgPrevious * 1.1) return "improving";
  if (avgRecent < avgPrevious * 0.9) return "degrading";
  return "stable";
}

export function getEffectivenessReport(): {
  current: number;
  trend: string;
  recommendation: string;
} {
  const latest = SNAPSHOTS[SNAPSHOTS.length - 1];
  const current = latest?.effectivenessScore ?? 0;
  const trend = getThroughputTrend();

  let recommendation: string;
  if (current > 90) {
    recommendation = "Excellent — maintain current config";
  } else if (current > 75) {
    recommendation = "Good — minor optimizations possible";
  } else {
    recommendation = "Below target — review automation config";
  }

  return { current, trend, recommendation };
}
