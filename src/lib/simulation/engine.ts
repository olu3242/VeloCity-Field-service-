/**
 * Simulation Engine — pure mathematical stress testing and what-if analysis.
 * ISOLATED from production runtime: no DB writes, no real event emission.
 */

import { DEFAULT_TWIN_CONFIG } from "@/lib/simulation/digital-twin";

export type SimulationScenario =
  | "queue_stress"
  | "retry_storm"
  | "webhook_failure"
  | "sla_degradation"
  | "replay_safety"
  | "tenant_scale"
  | "ai_congestion";

export interface SimulationParams {
  scenario: SimulationScenario;
  durationSeconds: number;
  intensityMultiplier: number;
  tenantCount?: number;
  config?: Partial<{ workerCount: number; aiCapacity: number; queueLimit: number }>;
}

export interface SimulationResult {
  scenario: SimulationScenario;
  durationSeconds: number;
  params: SimulationParams;
  outcomes: {
    eventsGenerated: number;
    eventsProcessed: number;
    eventsFailed: number;
    maxQueueDepth: number;
    slaBreaches: number;
    retryStorms: number;
    circuitBreakersOpened: number;
    estimatedCostUsd: number;
  };
  verdict: "stable" | "degraded" | "collapsed";
  insights: string[];
  recommendations: string[];
  simulatedAt: string;
}

const SIMULATION_RESULTS: SimulationResult[] = [];

function buildInsights(outcomes: SimulationResult["outcomes"], params: SimulationParams): string[] {
  const msgs: string[] = [];
  if (outcomes.maxQueueDepth > 50) {
    msgs.push(`Queue depth reached ${outcomes.maxQueueDepth} — consider additional workers.`);
  }
  if (outcomes.slaBreaches > 0) {
    msgs.push(`${outcomes.slaBreaches} SLA breaches detected at ${params.intensityMultiplier}× intensity.`);
  }
  if (outcomes.retryStorms > 0) {
    msgs.push(`Retry storm generated ${outcomes.retryStorms} retry events — throttle controls recommended.`);
  }
  if (outcomes.circuitBreakersOpened > 0) {
    msgs.push(`${outcomes.circuitBreakersOpened} circuit breakers would open under this load.`);
  }
  if (outcomes.estimatedCostUsd > 10) {
    msgs.push(`Estimated AI cost $${outcomes.estimatedCostUsd.toFixed(2)} USD for this scenario.`);
  }
  return msgs;
}

function buildRecommendations(
  verdict: SimulationResult["verdict"],
  scenario: SimulationScenario
): string[] {
  const recs: string[] = [];
  if (verdict === "collapsed") {
    recs.push("Scale workers horizontally before reaching this load level.");
    recs.push("Activate throttle controls to shed excess traffic.");
  } else if (verdict === "degraded") {
    recs.push("Monitor queue depth closely; pre-warm additional capacity.");
  }
  if (scenario === "retry_storm") {
    recs.push("Enable suppressLowPriority in RetryPressureConfig to reduce storm impact.");
  }
  if (scenario === "ai_congestion") {
    recs.push("Increase aiCallCapacity or stagger AI calls with backoff.");
  }
  if (scenario === "tenant_scale") {
    recs.push("Verify per-tenant RLS and flood protection hold under multi-tenant scale.");
  }
  return recs;
}

export function runSimulation(params: SimulationParams): SimulationResult {
  const workerCount = params.config?.workerCount ?? DEFAULT_TWIN_CONFIG.workerCount;
  const avgProcessingMs = DEFAULT_TWIN_CONFIG.avgProcessingTimeMs;

  const eventsGenerated = Math.round(params.durationSeconds * 10 * params.intensityMultiplier);
  const workerThroughput = workerCount * (1_000 / avgProcessingMs) * params.durationSeconds;
  const eventsProcessed = Math.min(eventsGenerated, workerThroughput);
  const eventsFailed =
    eventsGenerated > eventsProcessed
      ? Math.round((eventsGenerated - eventsProcessed) * 0.1)
      : 0;
  const maxQueueDepth = Math.max(0, eventsGenerated - eventsProcessed);
  const slaBreaches = maxQueueDepth > 50 ? Math.floor(maxQueueDepth / 10) : 0;
  const retryStorms =
    params.scenario === "retry_storm" ? Math.floor(eventsGenerated * 0.3) : 0;
  const circuitBreakersOpened = slaBreaches > 5 ? 2 : 0;
  const estimatedCostUsd = eventsProcessed * 0.000009 * 1_500;

  const outcomes: SimulationResult["outcomes"] = {
    eventsGenerated,
    eventsProcessed: Math.round(eventsProcessed),
    eventsFailed,
    maxQueueDepth: Math.round(maxQueueDepth),
    slaBreaches,
    retryStorms,
    circuitBreakersOpened,
    estimatedCostUsd,
  };

  const verdict: SimulationResult["verdict"] =
    eventsFailed > eventsGenerated * 0.3
      ? "collapsed"
      : eventsFailed > 0
      ? "degraded"
      : "stable";

  const result: SimulationResult = {
    scenario: params.scenario,
    durationSeconds: params.durationSeconds,
    params,
    outcomes,
    verdict,
    insights: buildInsights(outcomes, params),
    recommendations: buildRecommendations(verdict, params.scenario),
    simulatedAt: new Date().toISOString(),
  };

  SIMULATION_RESULTS.push(result);
  return result;
}

export function getSimulationHistory(): SimulationResult[] {
  return [...SIMULATION_RESULTS];
}

export function runWhatIfAnalysis(
  baseline: SimulationParams,
  variations: Partial<SimulationParams>[]
): SimulationResult[] {
  const baselineResult = runSimulation(baseline);
  const variationResults = variations.map((v) => runSimulation({ ...baseline, ...v }));
  return [baselineResult, ...variationResults];
}
