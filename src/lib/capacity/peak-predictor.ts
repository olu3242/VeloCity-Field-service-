import { calculateOptimalWorkers } from "@/lib/scaling/load-balancer";

export interface PeakPrediction {
  windowLabel: string; // e.g. "next_hour"
  expectedPeakDepth: number;
  expectedPeakRate: number;
  recommendedWorkers: number;
  riskLevel: "low" | "medium" | "high";
  generatedAt: string;
}

const PEAK_HISTORY: PeakPrediction[] = [];
const PEAK_HISTORY_CAP = 48;

function resolveRiskLevel(multiplier: number): "low" | "medium" | "high" {
  if (multiplier >= 3) return "high";
  if (multiplier >= 2) return "medium";
  return "low";
}

export async function predictPeak(
  windowLabel: string,
  expectedMultiplier: number
): Promise<PeakPrediction> {
  const { getCurrentStatus } = await import("@/lib/realtime/queue-stream");
  const current = getCurrentStatus();

  const expectedPeakDepth = Math.round(current.queueDepth * expectedMultiplier);
  const expectedPeakRate = Math.round(
    current.processingRate * expectedMultiplier
  );
  const recommendedWorkers = calculateOptimalWorkers(expectedPeakDepth, 60, 2000);
  const riskLevel = resolveRiskLevel(expectedMultiplier);

  const prediction: PeakPrediction = {
    windowLabel,
    expectedPeakDepth,
    expectedPeakRate,
    recommendedWorkers,
    riskLevel,
    generatedAt: new Date().toISOString(),
  };

  PEAK_HISTORY.push(prediction);
  if (PEAK_HISTORY.length > PEAK_HISTORY_CAP) {
    PEAK_HISTORY.shift();
  }

  return prediction;
}

export async function getScalingRecommendation(): Promise<string> {
  const prediction = await predictPeak("next_hour", 1.5);
  return (
    `[${prediction.windowLabel}] Risk: ${prediction.riskLevel}. ` +
    `Expected peak depth: ${prediction.expectedPeakDepth}, ` +
    `peak rate: ${prediction.expectedPeakRate} events/min. ` +
    `Recommended workers: ${prediction.recommendedWorkers}.`
  );
}

export function getPeakHistory(): PeakPrediction[] {
  return PEAK_HISTORY.slice();
}
