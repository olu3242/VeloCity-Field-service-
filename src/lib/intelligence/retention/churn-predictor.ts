/**
 * Churn Predictor — risk scoring for customer and provider retention.
 */

export interface ChurnRisk {
  entityId: string;
  entityType: "customer" | "provider";
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: string[];
  recommendedAction: string;
  predictedAt: string;
}

export interface ProviderInactivitySignal {
  providerId: string;
  daysSinceLastJob: number;
  daysSinceLastLogin: number;
  completedJobsLast30d: number;
  acceptanceRateLast30d: number;
  inactivityScore: number;
}

export interface CustomerDropoffSignal {
  customerId: string;
  daysSinceLastBooking: number;
  bookingsLast90d: number;
  hasOpenDispute: boolean;
  lastRating?: number;
  dropoffScore: number;
}

interface ChurnInput {
  entityId: string;
  entityType: "customer" | "provider";
  daysSinceLastActivity: number;
  activityCount30d: number;
  hasDispute?: boolean;
  rating?: number;
  acceptanceRate?: number;
}

function baseScoreFromDays(days: number): number {
  if (days <= 7) return 10;
  if (days <= 14) return 25;
  if (days <= 30) return 50;
  if (days <= 60) return 75;
  return 90;
}

function riskLevel(score: number): ChurnRisk["riskLevel"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function recommendedAction(level: ChurnRisk["riskLevel"]): string {
  switch (level) {
    case "critical": return "Immediate outreach required.";
    case "high": return "Scheduled retention campaign.";
    case "medium": return "Engagement nudge via notification.";
    case "low": return "Monitor; no action needed.";
  }
}

export function predictChurn(input: ChurnInput): ChurnRisk {
  let score = baseScoreFromDays(input.daysSinceLastActivity);
  const signals: string[] = [];

  if (input.activityCount30d === 0) {
    score += 15;
    signals.push("Zero activity in the last 30 days.");
  }
  if (input.hasDispute) {
    score += 10;
    signals.push("Open dispute on record.");
  }
  if (input.rating !== undefined && input.rating < 3) {
    score += 10;
    signals.push(`Low rating: ${input.rating.toFixed(1)}.`);
  }
  if (input.acceptanceRate !== undefined && input.acceptanceRate < 0.5) {
    score += 10;
    signals.push(`Low acceptance rate: ${(input.acceptanceRate * 100).toFixed(0)}%.`);
  }
  if (signals.length === 0) {
    signals.push(`${input.daysSinceLastActivity} days since last activity.`);
  }

  score = Math.min(100, score);
  const level = riskLevel(score);

  return {
    entityId: input.entityId,
    entityType: input.entityType,
    riskScore: score,
    riskLevel: level,
    signals,
    recommendedAction: recommendedAction(level),
    predictedAt: new Date().toISOString(),
  };
}

interface ProviderRow {
  providerId: string;
  daysSinceLastJob: number;
  daysSinceLastLogin: number;
  jobsLast30d: number;
  acceptanceRate: number;
}

export function detectProviderInactivity(providers: ProviderRow[]): ProviderInactivitySignal[] {
  return providers.map((p) => {
    const inactivityScore = Math.min(
      100,
      p.daysSinceLastJob * 2 +
        p.daysSinceLastLogin +
        Math.max(0, 10 - p.jobsLast30d) * 3 +
        Math.max(0, 1 - p.acceptanceRate) * 20
    );
    return {
      providerId: p.providerId,
      daysSinceLastJob: p.daysSinceLastJob,
      daysSinceLastLogin: p.daysSinceLastLogin,
      completedJobsLast30d: p.jobsLast30d,
      acceptanceRateLast30d: p.acceptanceRate,
      inactivityScore,
    };
  });
}

interface CustomerRow {
  customerId: string;
  daysSinceLastBooking: number;
  bookingsLast90d: number;
  hasOpenDispute: boolean;
  lastRating?: number;
}

export function detectCustomerDropoff(customers: CustomerRow[]): CustomerDropoffSignal[] {
  return customers.map((c) => {
    const dropoffScore = Math.min(
      100,
      c.daysSinceLastBooking * 1.5 +
        Math.max(0, 5 - c.bookingsLast90d) * 5 +
        (c.hasOpenDispute ? 20 : 0) +
        ((c.lastRating ?? 4) < 3 ? 15 : 0)
    );
    return {
      customerId: c.customerId,
      daysSinceLastBooking: c.daysSinceLastBooking,
      bookingsLast90d: c.bookingsLast90d,
      hasOpenDispute: c.hasOpenDispute,
      lastRating: c.lastRating,
      dropoffScore,
    };
  });
}
