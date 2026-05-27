/**
 * Anonymized platform-wide benchmarking metrics.
 */

export interface BenchmarkMetric {
  metricName: string;
  platformAvg: number;
  platformP50: number;
  platformP95: number;
  sampleCount: number;
  updatedAt: string;
}

const MAX_SAMPLES = 200;
const BENCHMARKS: Map<string, number[]> = new Map();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function recordMetric(metricName: string, value: number): void {
  const samples = BENCHMARKS.get(metricName) ?? [];
  samples.push(value);
  if (samples.length > MAX_SAMPLES) samples.shift();
  BENCHMARKS.set(metricName, samples);
}

export function getBenchmark(metricName: string): BenchmarkMetric | undefined {
  const samples = BENCHMARKS.get(metricName);
  if (!samples || samples.length === 0) return undefined;

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;

  return {
    metricName,
    platformAvg: avg,
    platformP50: percentile(sorted, 50),
    platformP95: percentile(sorted, 95),
    sampleCount: sorted.length,
    updatedAt: new Date().toISOString(),
  };
}

export function getAllBenchmarks(): BenchmarkMetric[] {
  return Array.from(BENCHMARKS.keys())
    .map((name) => getBenchmark(name))
    .filter((b): b is BenchmarkMetric => b !== undefined);
}

export function compareToP50(
  metricName: string,
  value: number,
): "above" | "below" | "at" {
  const benchmark = getBenchmark(metricName);
  if (!benchmark) return "at";

  const p50 = benchmark.platformP50;
  const tolerance = p50 * 0.05;

  if (value > p50 + tolerance) return "above";
  if (value < p50 - tolerance) return "below";
  return "at";
}
