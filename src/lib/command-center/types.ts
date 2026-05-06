import type { ScoreLevel } from "@/lib/scoring";

export interface CommandCenterScore {
  score: number;
  level: ScoreLevel;
  reasons: string[];
  recommendations: string[];
}

export interface CommandCenterMetrics {
  gmvCents: number;
  netRevenueCents: number;
  commissionRevenueCents: number;
  averageJobValueCents: number;
  activeJobs: number;
  unassignedJobs: number;
  slaBreaches: number;
  paymentFailures: number;
  payoutQueue: number;
  disputes: number;
  providerSupplyGaps: number;
  churnRisk: number;
  territoryReadiness: number;
  aiAgentActivity: number;
  failedAutomations: number;
  pricingFlags: number;
  payoutHolds: number;
  refundRisk: number;
  revenueLeakageAlerts: number;
  activeProviders: number;
  totalProviders: number;
  completedJobs: number;
}

export interface RecommendedAction {
  id: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  owner: "ops" | "finance" | "growth" | "provider" | "customer_success" | "automation";
  reason: string;
  auditEvent: string;
  href?: string;
}

export function normalizeScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function commandLevel(score: number, inverted = false): ScoreLevel {
  const value = normalizeScore(score);
  if (inverted) {
    if (value >= 80) return "low";
    if (value >= 60) return "medium";
    if (value >= 35) return "high";
    return "critical";
  }
  if (value >= 85) return "critical";
  if (value >= 65) return "high";
  if (value >= 35) return "medium";
  return "low";
}

export function buildScore(score: number, reasons: string[], recommendations: string[], inverted = true): CommandCenterScore {
  const normalized = normalizeScore(score);
  return {
    score: normalized,
    level: commandLevel(normalized, inverted),
    reasons,
    recommendations,
  };
}
