export type DecisionDomain =
  | "dispute_routing"
  | "escalation_timing"
  | "payout_prioritization"
  | "retry_strategy"
  | "provider_intervention"
  | "workflow_path";

export interface OptimizationContext {
  domain: DecisionDomain;
  entityId: string;
  tenantId: string;
  currentStrategy: string;
  signals: Record<string, number>;
}

export interface OptimizationRecommendation {
  domain: DecisionDomain;
  recommendedStrategy: string;
  confidence: number;
  reasoning: string;
  alternativeStrategies: string[];
  estimatedImpact: "low" | "medium" | "high";
}

type Partial4 = Pick<
  OptimizationRecommendation,
  "recommendedStrategy" | "confidence" | "reasoning" | "alternativeStrategies" | "estimatedImpact"
>;

function routeDispute(signals: Record<string, number>): Partial4 {
  if ((signals["trust_score"] ?? 0) > 80) {
    return {
      recommendedStrategy: "auto_resolve",
      confidence: 0.85,
      reasoning: `Trust score ${signals["trust_score"]} exceeds 80 — auto-resolution safe`,
      alternativeStrategies: ["human_review", "hybrid_review"],
      estimatedImpact: "high",
    };
  }
  return {
    recommendedStrategy: "human_review",
    confidence: 0.7,
    reasoning: `Trust score ${signals["trust_score"] ?? "unknown"} below threshold — manual review warranted`,
    alternativeStrategies: ["auto_resolve", "expedited_review"],
    estimatedImpact: "medium",
  };
}

function routeEscalation(signals: Record<string, number>): Partial4 {
  const days = signals["days_open"] ?? 0;
  const all = ["immediate_escalate", "schedule_review", "monitor"];
  if (days > 3) {
    return {
      recommendedStrategy: "immediate_escalate",
      confidence: 0.9,
      reasoning: `Case open ${days} days — immediate escalation required`,
      alternativeStrategies: all.filter((s) => s !== "immediate_escalate"),
      estimatedImpact: "high",
    };
  }
  if (days > 1) {
    return {
      recommendedStrategy: "schedule_review",
      confidence: 0.75,
      reasoning: `Case open ${days} days — scheduled review appropriate`,
      alternativeStrategies: all.filter((s) => s !== "schedule_review"),
      estimatedImpact: "medium",
    };
  }
  return {
    recommendedStrategy: "monitor",
    confidence: 0.65,
    reasoning: "Case recently opened — monitoring sufficient",
    alternativeStrategies: all.filter((s) => s !== "monitor"),
    estimatedImpact: "low",
  };
}

function routePayout(signals: Record<string, number>): Partial4 {
  const all = ["priority_release", "standard_release", "hold_for_review"];
  if ((signals["trust_score"] ?? 0) > 85) {
    return {
      recommendedStrategy: "priority_release",
      confidence: 0.88,
      reasoning: `High trust score ${signals["trust_score"]} — priority payout release`,
      alternativeStrategies: all.filter((s) => s !== "priority_release"),
      estimatedImpact: "high",
    };
  }
  if ((signals["dispute_rate"] ?? 1) < 0.02) {
    return {
      recommendedStrategy: "standard_release",
      confidence: 0.8,
      reasoning: `Low dispute rate ${signals["dispute_rate"]} — standard release safe`,
      alternativeStrategies: all.filter((s) => s !== "standard_release"),
      estimatedImpact: "medium",
    };
  }
  return {
    recommendedStrategy: "hold_for_review",
    confidence: 0.75,
    reasoning: "Elevated dispute rate or low trust — hold for review",
    alternativeStrategies: all.filter((s) => s !== "hold_for_review"),
    estimatedImpact: "medium",
  };
}

function routeRetry(signals: Record<string, number>): Partial4 {
  const retries = signals["retry_count"] ?? 0;
  const all = ["immediate_retry", "standard_backoff", "exponential_backoff_extended"];
  if (retries > 2) {
    return {
      recommendedStrategy: "exponential_backoff_extended",
      confidence: 0.85,
      reasoning: `${retries} retries exceeded — use extended backoff`,
      alternativeStrategies: all.filter((s) => s !== "exponential_backoff_extended"),
      estimatedImpact: "high",
    };
  }
  if (retries > 1) {
    return {
      recommendedStrategy: "standard_backoff",
      confidence: 0.75,
      reasoning: `${retries} retries — standard backoff appropriate`,
      alternativeStrategies: all.filter((s) => s !== "standard_backoff"),
      estimatedImpact: "medium",
    };
  }
  return {
    recommendedStrategy: "immediate_retry",
    confidence: 0.9,
    reasoning: "First retry attempt — immediate retry safe",
    alternativeStrategies: all.filter((s) => s !== "immediate_retry"),
    estimatedImpact: "low",
  };
}

function routeProvider(signals: Record<string, number>): Partial4 {
  const score = signals["trust_score"] ?? 100;
  const all = ["suspend_review", "quality_coaching", "monitor"];
  if (score < 40) {
    return {
      recommendedStrategy: "suspend_review",
      confidence: 0.92,
      reasoning: `Critical trust score ${score} — suspension review required`,
      alternativeStrategies: all.filter((s) => s !== "suspend_review"),
      estimatedImpact: "high",
    };
  }
  if (score < 60) {
    return {
      recommendedStrategy: "quality_coaching",
      confidence: 0.78,
      reasoning: `Low trust score ${score} — quality coaching recommended`,
      alternativeStrategies: all.filter((s) => s !== "quality_coaching"),
      estimatedImpact: "medium",
    };
  }
  return {
    recommendedStrategy: "monitor",
    confidence: 0.7,
    reasoning: `Trust score ${score} acceptable — continue monitoring`,
    alternativeStrategies: all.filter((s) => s !== "monitor"),
    estimatedImpact: "low",
  };
}

export function optimizeDecision(ctx: OptimizationContext): OptimizationRecommendation {
  const { domain, signals } = ctx;
  let partial: Partial4 = {
    recommendedStrategy: "default",
    confidence: 0.5,
    reasoning: "Insufficient signals for optimization",
    alternativeStrategies: [],
    estimatedImpact: "low",
  };

  if (domain === "dispute_routing") partial = routeDispute(signals);
  else if (domain === "escalation_timing") partial = routeEscalation(signals);
  else if (domain === "payout_prioritization") partial = routePayout(signals);
  else if (domain === "retry_strategy") partial = routeRetry(signals);
  else if (domain === "provider_intervention") partial = routeProvider(signals);

  return { domain, ...partial };
}

export function batchOptimize(
  contexts: OptimizationContext[]
): OptimizationRecommendation[] {
  return contexts.map(optimizeDecision);
}
