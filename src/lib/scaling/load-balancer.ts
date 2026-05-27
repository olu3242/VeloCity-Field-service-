/**
 * Load Balancer — queue load analysis and worker scaling recommendations.
 */

export interface LoadProfile {
  queueDepth: number;
  processingRate: number;
  failureRate: number;
  avgLatencyMs: number;
  workerCount: number;
  aiCallsPerMinute: number;
}

export interface ScalingRecommendation {
  action: "scale_up" | "scale_down" | "maintain" | "throttle" | "rebalance";
  urgency: "low" | "medium" | "high" | "critical";
  targetWorkers?: number;
  targetAICapacity?: number;
  reason: string;
  estimatedImpact: string;
}

export function analyzeLoad(profile: LoadProfile): ScalingRecommendation {
  const { queueDepth, processingRate, failureRate, avgLatencyMs, workerCount } = profile;

  if (queueDepth > processingRate * 30) {
    const targetWorkers = calculateOptimalWorkers(queueDepth, 60, 2_000);
    return {
      action: "scale_up",
      urgency: "critical",
      targetWorkers,
      reason: `Queue depth (${queueDepth}) exceeds 30× processing rate (${processingRate}/s) — severe backlog.`,
      estimatedImpact: `Adding workers to ${targetWorkers} should drain queue within ~60s.`,
    };
  }

  if (failureRate > 0.2) {
    return {
      action: "throttle",
      urgency: "high",
      reason: `Failure rate ${(failureRate * 100).toFixed(1)}% exceeds 20% threshold — system under stress.`,
      estimatedImpact: "Throttling reduces incoming load, allowing recovery and failure rate to drop.",
    };
  }

  if (queueDepth < processingRate * 2 && workerCount > 1) {
    const targetWorkers = Math.max(1, workerCount - 1);
    return {
      action: "scale_down",
      urgency: "low",
      targetWorkers,
      reason: `Queue depth (${queueDepth}) well below processing capacity — workers underutilised.`,
      estimatedImpact: `Reducing to ${targetWorkers} worker(s) saves resources with no throughput impact.`,
    };
  }

  if (avgLatencyMs > 10_000) {
    return {
      action: "rebalance",
      urgency: "medium",
      reason: `Average latency ${avgLatencyMs}ms exceeds 10s — uneven load distribution detected.`,
      estimatedImpact: "Rebalancing distributes tasks evenly, expected latency reduction of 30–50%.",
    };
  }

  return {
    action: "maintain",
    urgency: "low",
    reason: "Load profile is within healthy operating bounds.",
    estimatedImpact: "No change needed; continue monitoring.",
  };
}

export function calculateOptimalWorkers(
  queueDepth: number,
  targetDrainTimeS: number,
  avgProcessingMs: number
): number {
  return Math.ceil((queueDepth / targetDrainTimeS) / (1_000 / avgProcessingMs));
}
