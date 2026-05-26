import { getAllLatencyBuckets } from "./latency-map";
import { getFailuresByEventType } from "./failure-lineage";

export interface CorrelationEdge {
  fromEvent: string;
  toEvent: string;
  frequency: number;
  avgDelayMs: number;
  lastSeenAt: string;
}

export interface BottleneckReport {
  operation: string;
  avgLatencyMs: number;
  callCount: number;
  failureRate: number;
  severity: "low" | "medium" | "high" | "critical";
}

const CORRELATION_EDGES = new Map<string, CorrelationEdge>();

function edgeKey(fromEvent: string, toEvent: string): string {
  return `${fromEvent}→${toEvent}`;
}

function computeSeverity(
  p95Ms: number
): "low" | "medium" | "high" | "critical" {
  if (p95Ms > 5000) return "critical";
  if (p95Ms > 2000) return "high";
  if (p95Ms > 1000) return "medium";
  return "low";
}

export function recordCorrelation(
  fromEvent: string,
  toEvent: string,
  delayMs: number
): void {
  const key = edgeKey(fromEvent, toEvent);
  const existing = CORRELATION_EDGES.get(key);

  if (existing !== undefined) {
    existing.avgDelayMs =
      (existing.avgDelayMs * existing.frequency + delayMs) /
      (existing.frequency + 1);
    existing.frequency += 1;
    existing.lastSeenAt = new Date().toISOString();
  } else {
    CORRELATION_EDGES.set(key, {
      fromEvent,
      toEvent,
      frequency: 1,
      avgDelayMs: delayMs,
      lastSeenAt: new Date().toISOString(),
    });
  }
}

export function getCorrelationsFrom(eventType: string): CorrelationEdge[] {
  return Array.from(CORRELATION_EDGES.values()).filter(
    (e) => e.fromEvent === eventType
  );
}

export function detectBottlenecks(
  latencyThresholdMs: number
): BottleneckReport[] {
  return getAllLatencyBuckets()
    .filter((bucket) => bucket.p95Ms > latencyThresholdMs)
    .map((bucket) => {
      const failures = getFailuresByEventType(bucket.operation);
      const failureRate =
        bucket.sampleCount > 0 ? failures.length / bucket.sampleCount : 0;

      return {
        operation: bucket.operation,
        avgLatencyMs: bucket.avgMs,
        callCount: bucket.sampleCount,
        failureRate,
        severity: computeSeverity(bucket.p95Ms),
      };
    });
}

export function getMostFrequentSequences(limit = 10): CorrelationEdge[] {
  return Array.from(CORRELATION_EDGES.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);
}
