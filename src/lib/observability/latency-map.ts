export interface LatencyBucket {
  operation: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  sampleCount: number;
  lastUpdatedAt: string;
}

const SAMPLES_CAP = 100;
const LATENCY_SAMPLES = new Map<string, number[]>();

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((pct / 100) * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

function buildBucket(operation: string, samples: number[]): LatencyBucket {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg =
    sorted.length > 0
      ? sorted.reduce((acc, v) => acc + v, 0) / sorted.length
      : 0;

  return {
    operation,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    avgMs: avg,
    sampleCount: sorted.length,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function recordLatency(operation: string, latencyMs: number): void {
  const samples = LATENCY_SAMPLES.get(operation) ?? [];
  samples.push(latencyMs);
  if (samples.length > SAMPLES_CAP) {
    samples.shift();
  }
  LATENCY_SAMPLES.set(operation, samples);
}

export function getLatencyBucket(
  operation: string
): LatencyBucket | undefined {
  const samples = LATENCY_SAMPLES.get(operation);
  if (!samples || samples.length === 0) return undefined;
  return buildBucket(operation, samples);
}

export function getAllLatencyBuckets(): LatencyBucket[] {
  return Array.from(LATENCY_SAMPLES.entries())
    .filter(([, samples]) => samples.length > 0)
    .map(([operation, samples]) => buildBucket(operation, samples));
}

export function getSlowOperations(thresholdMs: number): LatencyBucket[] {
  return getAllLatencyBuckets().filter((b) => b.p95Ms > thresholdMs);
}
