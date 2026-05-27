/**
 * Executive operational summaries.
 * Aggregates platform health, ROI, SLA compliance, and AI effectiveness.
 */

import { calculateEffectiveness } from "@/lib/economy/telemetry";
import { scoreOperationalReadiness } from "@/lib/maturity/readiness-scorer";

export interface ExecutiveSummary {
  period: string;
  platformHealth: number;
  automationROIUsd: number;
  incidentsOpen: number;
  slaComplianceRate: number;
  aiEffectivenessScore: number;
  topRisks: string[];
  topOpportunities: string[];
  generatedAt: string;
}

const CAP = 100;
export const SUMMARIES: ExecutiveSummary[] = [];

export function generateSummary(params: {
  automationROIUsd: number;
  incidentsOpen: number;
  slaComplianceRate: number;
  topRisks: string[];
  topOpportunities: string[];
}): ExecutiveSummary {
  const effectiveness = calculateEffectiveness();
  const readiness = scoreOperationalReadiness();

  const summary: ExecutiveSummary = {
    period: new Date().toISOString().slice(0, 16),
    platformHealth: readiness.composite,
    automationROIUsd: params.automationROIUsd,
    incidentsOpen: params.incidentsOpen,
    slaComplianceRate: params.slaComplianceRate,
    aiEffectivenessScore: effectiveness.composite,
    topRisks: params.topRisks,
    topOpportunities: params.topOpportunities,
    generatedAt: new Date().toISOString(),
  };

  SUMMARIES.push(summary);
  if (SUMMARIES.length > CAP) {
    SUMMARIES.shift();
  }

  return summary;
}

export function getLatestSummary(): ExecutiveSummary | undefined {
  return SUMMARIES[SUMMARIES.length - 1];
}

export function getSummaryHistory(limit = 10): ExecutiveSummary[] {
  return SUMMARIES.slice(-limit);
}

export function getPlatformHealthTrend(): "improving" | "stable" | "declining" {
  if (SUMMARIES.length < 6) return "stable";

  const recent = SUMMARIES.slice(-3);
  const previous = SUMMARIES.slice(-6, -3);

  const avgRecent =
    recent.reduce((sum, s) => sum + s.platformHealth, 0) / recent.length;
  const avgPrevious =
    previous.reduce((sum, s) => sum + s.platformHealth, 0) / previous.length;

  const delta = avgRecent - avgPrevious;
  if (delta > 2) return "improving";
  if (delta < -2) return "declining";
  return "stable";
}
