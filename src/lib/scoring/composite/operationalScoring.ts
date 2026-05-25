// Composite Operational Scoring Engine
// Aggregates individual scoring modules into unified risk/health signals.

import { calculateDisputeRiskScore } from "@/lib/scoring/disputeRiskScore";
import { calculateProviderTrustScore } from "@/lib/scoring/providerTrustScore";
import { calculatePaymentRiskScore } from "@/lib/scoring/paymentRiskScore";
import { calculateJobRiskScore } from "@/lib/scoring/jobRiskScore";
import { calculateRetentionProbabilityScore } from "@/lib/scoring/retentionScore";
import type { ScoreResult } from "@/lib/scoring/types";

// ── Job composite risk ────────────────────────────────────────────────────

export interface JobRiskProfile {
  disputeRisk: ScoreResult;
  paymentRisk: ScoreResult;
  jobRisk: ScoreResult;
  composite: ScoreResult;
  escalate: boolean;
  flags: string[];
}

export function buildJobRiskProfile(input: {
  providerTrustScore?: number;
  customerTrustScore?: number;
  quoteFairnessScore?: number;
  hasChangeOrder?: boolean;
  completionConfirmed?: boolean;
  amountCents?: number;
  priorFailedPayments?: number;
  hasActiveDispute?: boolean;
  urgency?: string;
}): JobRiskProfile {
  const disputeRisk = calculateDisputeRiskScore({
    providerTrustScore: input.providerTrustScore,
    customerTrustScore: input.customerTrustScore,
    quoteFairnessScore: input.quoteFairnessScore,
    hasChangeOrder: input.hasChangeOrder,
    completionConfirmed: input.completionConfirmed,
  });

  const paymentRisk = calculatePaymentRiskScore({
    amountCents: input.amountCents,
    priorFailures: input.priorFailedPayments,
    customerTrustScore: input.customerTrustScore,
  });

  const jobRisk = calculateJobRiskScore({
    urgency: input.urgency,
    customerTrustScore: input.customerTrustScore,
  });

  const compositeScore = Math.round(
    disputeRisk.score * 0.4 + paymentRisk.score * 0.35 + jobRisk.score * 0.25
  );

  const flags: string[] = [];
  if (disputeRisk.level === "critical") flags.push("HIGH_DISPUTE_RISK");
  if (paymentRisk.level === "critical") flags.push("HIGH_PAYMENT_RISK");
  if (input.hasActiveDispute) flags.push("ACTIVE_DISPUTE");
  if ((input.priorFailedPayments ?? 0) > 0) flags.push("FAILED_PAYMENTS");
  if (input.hasChangeOrder && !input.completionConfirmed) flags.push("UNCONFIRMED_CHANGE_ORDER");

  const allRecommendations = [
    ...disputeRisk.recommendations,
    ...paymentRisk.recommendations,
  ];
  const uniqueRecommendations = allRecommendations.filter(
    (rec, idx) => allRecommendations.indexOf(rec) === idx
  );

  const composite: ScoreResult = {
    score: compositeScore,
    level: compositeScore >= 75 ? "critical" : compositeScore >= 50 ? "high" : compositeScore >= 25 ? "medium" : "low",
    reasons: [...disputeRisk.reasons, ...paymentRisk.reasons],
    recommendations: uniqueRecommendations,
  };

  return {
    disputeRisk,
    paymentRisk,
    jobRisk,
    composite,
    escalate: compositeScore >= 75 || flags.includes("ACTIVE_DISPUTE"),
    flags,
  };
}

// ── Provider health ───────────────────────────────────────────────────────

export interface ProviderHealthProfile {
  trustScore: ScoreResult;
  retentionScore: ScoreResult;
  overallHealth: "excellent" | "good" | "at_risk" | "critical";
  suspendRecommended: boolean;
  flags: string[];
}

export function buildProviderHealthProfile(input: {
  trustScore?: number;
  completedJobs?: number;
  cancellationRate?: number;
  averageRating?: number;
  responseTimeMinutes?: number;
  isApproved?: boolean;
  disputeRate?: number;
  noShowRate?: number;
  recentDisputes?: number;
  daysSinceLastJob?: number;
}): ProviderHealthProfile {
  const trustScore = calculateProviderTrustScore({
    trustScore: input.trustScore != null ? input.trustScore / 100 : undefined,
    completedJobs: input.completedJobs,
    cancellationRate: input.cancellationRate,
    averageRating: input.averageRating,
    responseTimeMinutes: input.responseTimeMinutes,
    isApproved: input.isApproved,
  });

  const retentionScore = calculateRetentionProbabilityScore({
    completedJobs: input.completedJobs,
    lastRating: input.averageRating,
    daysSinceLastJob: input.daysSinceLastJob,
  });

  const flags: string[] = [];
  if ((input.noShowRate ?? 0) > 0.1) flags.push("HIGH_NO_SHOW_RATE");
  if ((input.disputeRate ?? 0) > 0.15) flags.push("HIGH_DISPUTE_RATE");
  if ((input.recentDisputes ?? 0) >= 3) flags.push("MULTIPLE_RECENT_DISPUTES");
  if ((input.averageRating ?? 5) < 3.0) flags.push("LOW_RATING");

  const suspendRecommended =
    flags.includes("MULTIPLE_RECENT_DISPUTES") ||
    (flags.includes("HIGH_DISPUTE_RATE") && flags.includes("LOW_RATING"));

  const avgScore = (trustScore.score + retentionScore.score) / 2;
  const overallHealth =
    avgScore >= 80 ? "excellent" :
    avgScore >= 60 ? "good" :
    avgScore >= 35 ? "at_risk" : "critical";

  return { trustScore, retentionScore, overallHealth, suspendRecommended, flags };
}

// ── Platform operational pulse ────────────────────────────────────────────

export interface OperationalPulse {
  queuePressure: "normal" | "elevated" | "critical";
  disputeLoad: "normal" | "elevated" | "critical";
  payoutBacklog: "normal" | "elevated" | "critical";
  overallStatus: "healthy" | "degraded" | "critical";
  recommendations: string[];
}

export function buildOperationalPulse(input: {
  pendingQueueItems: number;
  processingQueueItems: number;
  openDisputes: number;
  pendingPayoutsCents: number;
  failedQueueItems: number;
}): OperationalPulse {
  const queuePressure =
    input.pendingQueueItems > 100 ? "critical" :
    input.pendingQueueItems > 30 ? "elevated" : "normal";

  const disputeLoad =
    input.openDisputes > 50 ? "critical" :
    input.openDisputes > 15 ? "elevated" : "normal";

  const payoutBacklog =
    input.pendingPayoutsCents > 500_000_00 ? "critical" :
    input.pendingPayoutsCents > 100_000_00 ? "elevated" : "normal";

  const criticalCount = [queuePressure, disputeLoad, payoutBacklog].filter(s => s === "critical").length;
  const elevatedCount = [queuePressure, disputeLoad, payoutBacklog].filter(s => s === "elevated").length;

  const overallStatus =
    criticalCount > 0 ? "critical" :
    elevatedCount >= 2 ? "degraded" : "healthy";

  const recommendations: string[] = [];
  if (queuePressure !== "normal") recommendations.push("Scale automation worker or investigate queue backlog.");
  if (disputeLoad !== "normal") recommendations.push("Review dispute queue — IVY may need capacity increase.");
  if (payoutBacklog !== "normal") recommendations.push("Release pending payouts — FINN review recommended.");
  if (input.failedQueueItems > 5) recommendations.push("Investigate failed queue items — possible handler errors.");

  return { queuePressure, disputeLoad, payoutBacklog, overallStatus, recommendations };
}
