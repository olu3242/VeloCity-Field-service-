// Digital Twin Execution Gate — simulates high-impact operations before committing them.
// Wraps the existing simulation module to produce a SimulationGate that the
// Execution Engine uses to decide whether to proceed, degrade, or abort.

import { getLatestTwinState, runSimulation } from "@/lib/digital-twin";
import type { ScenarioParams, ScenarioType, SimulationResult } from "@/lib/digital-twin";
import type { SimulationGate, SimulationRecommendation } from "./types";

// ── High-impact workflow identifiers ─────────────────────────────────────────
// These workflows trigger simulation before execution.

const HIGH_IMPACT_WORKFLOWS = new Set([
  "provider-assignment",
  "bulk-dispatch",
  "territory-expansion",
  "staffing-rebalance",
  "pricing-change",
  "sla-override",
  "bulk-cancellation",
  "franchise-configuration",
  "capacity-planning",
]);

export function requiresSimulation(workflow: string): boolean {
  return HIGH_IMPACT_WORKFLOWS.has(workflow);
}

// ── Scenario mapper ───────────────────────────────────────────────────────────
// Maps workflow intents to simulation scenario parameters.

function workflowToScenarioParams(workflow: string): ScenarioParams {
  const typeMap: Record<string, ScenarioType> = {
    "territory-expansion": "territory_expansion",
    "bulk-dispatch": "seasonal_spike",
    "staffing-rebalance": "provider_surge",
    "pricing-change": "pricing_increase",
    "capacity-planning": "workforce_expansion",
    "seasonal-adjustment": "seasonal_spike",
    "provider-assignment": "provider_surge",
    "bulk-cancellation": "customer_churn",
    "franchise-configuration": "revenue_growth_plan",
    "sla-override": "sla_degradation",
  };

  const type: ScenarioType = typeMap[workflow] ?? "territory_expansion";

  return {
    type,
    magnitude: 0.5,
    description: `WEF pre-execution simulation for ${workflow}`,
  };
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function scoreSimulationResult(result: SimulationResult): number {
  // impact.confidence is 0–100 from the simulation engine
  const rawConfidence = result.impact.confidence / 100;
  let score = Math.max(0, Math.min(1, rawConfidence));

  // Revenue loss reduces confidence
  if (result.impact.revenueImpactCents < 0) {
    score *= 0.85;
  }

  // Queue depth spike is risky
  if (result.impact.queueDepthChange > result.baseline.queueDepth * 0.5) {
    score *= 0.9;
  }

  return Math.max(0, Math.min(1, score));
}

function deriveRecommendation(confidence: number, threshold: number): SimulationRecommendation {
  if (confidence >= threshold) return "proceed";
  if (confidence >= threshold * 0.7) return "degrade";
  return "abort";
}

// ── Main gate ─────────────────────────────────────────────────────────────────

export async function evaluateSimulationGate(
  tenantId: string,
  workflow: string,
  context: Record<string, unknown>,
  threshold = 0.75,
): Promise<SimulationGate> {
  const simulatedAt = new Date().toISOString();

  if (!requiresSimulation(workflow)) {
    return {
      simulated: false,
      confidence: 1.0,
      threshold,
      passed: true,
      predictedImpact: {},
      recommendation: "proceed",
      simulatedAt,
    };
  }

  try {
    const twinState = await getLatestTwinState();
    if (!twinState) {
      return {
        simulated: false,
        confidence: 0.6,
        threshold,
        passed: 0.6 >= threshold,
        predictedImpact: {},
        recommendation: 0.6 >= threshold ? "proceed" : "degrade",
        simulatedAt,
      };
    }

    const params = workflowToScenarioParams(workflow);
    const result = runSimulation(twinState, params);

    const confidence = scoreSimulationResult(result);
    const recommendation = deriveRecommendation(confidence, threshold);

    return {
      simulated: true,
      confidence,
      threshold,
      passed: recommendation === "proceed",
      predictedImpact: {
        revenueImpactCents: result.impact.revenueImpactCents,
        queueDepthChange: result.impact.queueDepthChange,
        netImpactCents: result.financialProjection.netImpactCents,
        paybackPeriodDays: result.financialProjection.paybackPeriodDays ?? -1,
      },
      recommendation,
      simulatedAt,
    };
  } catch {
    // Simulation failure is non-fatal — degrade gracefully
    return {
      simulated: false,
      confidence: 0.5,
      threshold,
      passed: false,
      predictedImpact: {},
      recommendation: "degrade",
      simulatedAt,
    };
  }
}
