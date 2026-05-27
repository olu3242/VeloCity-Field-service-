export type FeedbackType =
  | "recommendation_accepted"
  | "recommendation_rejected"
  | "override_by_admin"
  | "outcome_positive"
  | "outcome_negative"
  | "escalation_resolved"
  | "escalation_failed";

export interface FeedbackRecord {
  id: string;
  domain: string;
  recommendationId?: string;
  feedbackType: FeedbackType;
  agentName?: string;
  tenantId: string;
  impact: "positive" | "negative" | "neutral";
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface FeedbackSummary {
  domain: string;
  totalFeedback: number;
  acceptanceRate: number;
  overrideRate: number;
  positiveOutcomeRate: number;
  agentEffectiveness: Record<string, number>;
}

const FEEDBACK = new Map<string, FeedbackRecord>();

export function recordFeedback(
  fb: Omit<FeedbackRecord, "id" | "recordedAt">
): FeedbackRecord {
  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: FeedbackRecord = { ...fb, id, recordedAt: new Date().toISOString() };
  FEEDBACK.set(id, full);
  return full;
}

export function getFeedbackSummary(
  domain: string,
  tenantId?: string
): FeedbackSummary {
  const records = Array.from(FEEDBACK.values()).filter(
    (r) => r.domain === domain && (tenantId === undefined || r.tenantId === tenantId)
  );

  const accepted = records.filter((r) => r.feedbackType === "recommendation_accepted").length;
  const rejected = records.filter((r) => r.feedbackType === "recommendation_rejected").length;
  const overrides = records.filter((r) => r.feedbackType === "override_by_admin").length;
  const positive = records.filter((r) => r.feedbackType === "outcome_positive").length;
  const negative = records.filter((r) => r.feedbackType === "outcome_negative").length;

  const acceptanceRate = accepted + rejected > 0 ? accepted / (accepted + rejected) : 0;
  const overrideRate = records.length > 0 ? overrides / records.length : 0;
  const positiveOutcomeRate = positive + negative > 0 ? positive / (positive + negative) : 0;

  const agentEffectiveness: Record<string, number> = {};
  const agentRecords = records.filter((r) => r.agentName !== undefined);
  const agentNames = Array.from(new Set(agentRecords.map((r) => r.agentName as string)));
  for (const agent of agentNames) {
    const agentFb = agentRecords.filter((r) => r.agentName === agent);
    const pos = agentFb.filter((r) => r.impact === "positive").length;
    agentEffectiveness[agent] = agentFb.length > 0 ? pos / agentFb.length : 0;
  }

  return {
    domain,
    totalFeedback: records.length,
    acceptanceRate,
    overrideRate,
    positiveOutcomeRate,
    agentEffectiveness,
  };
}

export function getAgentEffectiveness(agentName: string): number {
  const records = Array.from(FEEDBACK.values()).filter(
    (r) => r.agentName === agentName
  );
  if (records.length === 0) return 0;
  const positive = records.filter((r) => r.impact === "positive").length;
  return positive / records.length;
}

export function getTopInsights(
  limit = 5
): Array<{ insight: string; confidence: number }> {
  const domains = Array.from(new Set(Array.from(FEEDBACK.values()).map((r) => r.domain)));
  const insights: Array<{ insight: string; confidence: number }> = [];

  for (const domain of domains) {
    const summary = getFeedbackSummary(domain);
    if (summary.overrideRate > 0.3) {
      insights.push({
        insight: `Recommendations for ${domain} frequently overridden — review thresholds`,
        confidence: Math.min(0.95, 0.5 + summary.overrideRate),
      });
    }
    if (summary.acceptanceRate < 0.5 && summary.totalFeedback >= 3) {
      insights.push({
        insight: `Agent recommendations misaligned with operator decisions in ${domain}`,
        confidence: 0.5 + (0.5 - summary.acceptanceRate),
      });
    }
    if (summary.positiveOutcomeRate > 0.85 && summary.totalFeedback >= 3) {
      insights.push({
        insight: `${domain} automation highly effective`,
        confidence: summary.positiveOutcomeRate,
      });
    }
  }

  return insights
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
