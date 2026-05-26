import { getCurrentStatus } from "@/lib/realtime/queue-stream";

export interface QueueForecast {
  forecastWindowMs: number;
  predictedDepth: number;
  predictedProcessingRate: number;
  capacityHeadroomPct: number; // 0-100: remaining capacity before saturation
  confidenceScore: number; // 0-1
  generatedAt: string;
}

export interface QueueSample {
  timestamp: number;
  depth: number;
  processingRate: number;
  workerCount: number;
}

const SAMPLES: QueueSample[] = [];
const SAMPLE_CAP = 200;

export function recordSample(sample: QueueSample): void {
  SAMPLES.push(sample);
  if (SAMPLES.length > SAMPLE_CAP) {
    SAMPLES.shift();
  }
}

export function forecastQueue(windowMs: number): QueueForecast {
  if (SAMPLES.length < 5) {
    const status = getCurrentStatus();
    return {
      forecastWindowMs: windowMs,
      predictedDepth: status.queueDepth,
      predictedProcessingRate: status.processingRate,
      capacityHeadroomPct: Math.max(0, 100 - (status.queueDepth / 150) * 100),
      confidenceScore: Math.min(1, SAMPLES.length / 20),
      generatedAt: new Date().toISOString(),
    };
  }

  const recent = SAMPLES.slice(-10);
  const avgDepth =
    recent.reduce((sum, s) => sum + s.depth, 0) / recent.length;
  const avgRate =
    recent.reduce((sum, s) => sum + s.processingRate, 0) / recent.length;

  const predictedDepth =
    avgDepth + (avgRate * windowMs) / 60_000 * 0.1;
  const capacityHeadroomPct = Math.max(0, 100 - (predictedDepth / 150) * 100);
  const confidenceScore = Math.min(1, SAMPLES.length / 20);

  return {
    forecastWindowMs: windowMs,
    predictedDepth,
    predictedProcessingRate: avgRate,
    capacityHeadroomPct,
    confidenceScore,
    generatedAt: new Date().toISOString(),
  };
}

export function getDepthTrend(): "growing" | "stable" | "shrinking" {
  if (SAMPLES.length < 10) return "stable";

  const prev5 = SAMPLES.slice(-10, -5);
  const last5 = SAMPLES.slice(-5);

  const avgPrev =
    prev5.reduce((sum, s) => sum + s.depth, 0) / prev5.length;
  const avgLast =
    last5.reduce((sum, s) => sum + s.depth, 0) / last5.length;

  if (avgPrev === 0) return "stable";

  const changePct = (avgLast - avgPrev) / avgPrev;

  if (changePct > 0.1) return "growing";
  if (changePct < -0.1) return "shrinking";
  return "stable";
}

export function getSampleHistory(limit = 20): QueueSample[] {
  return SAMPLES.slice(-limit);
}
