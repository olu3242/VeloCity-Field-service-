export interface QueueItem {
  eventType: string;
  retryCount?: number;
  urgency?: string;
  slaBreachAt?: string;
  createdAt?: string;
}

export interface PriorityScore {
  eventType: string;
  baseScore: number;
  slaBoost: number;
  urgencyBoost: number;
  retryBoost: number;
  finalScore: number;
  priority: "low" | "medium" | "high" | "critical";
}

export const EVENT_BASE_PRIORITIES: Record<string, number> = {
  dispute_opened: 90,
  chargeback_opened: 90,
  payment_failed: 80,
  payout_failed: 80,
  sla_breach: 85,
  sla_breach_detected: 85,
  stuck_job_detected: 85,
  job_stuck: 85,
  sla_escalate: 85,
  job_completed: 70,
  customer_confirmed: 70,
  provider_offer_sent: 65,
  job_accepted: 65,
  tip_submitted: 30,
  review_requested: 30,
  daily_territory_analysis: 20,
  retention_campaign: 20,
  retention_campaign_due: 20,
};

export function calculatePriority(item: QueueItem): PriorityScore {
  const baseScore = EVENT_BASE_PRIORITIES[item.eventType] ?? 50;

  let slaBoost = 0;
  if (item.slaBreachAt) {
    const breachMs = new Date(item.slaBreachAt).getTime() - Date.now();
    if (breachMs <= 30 * 60 * 1000) {
      slaBoost = 20;
    }
  }

  let urgencyBoost = 0;
  if (item.urgency === "emergency") {
    urgencyBoost = 15;
  } else if (item.urgency === "same_day") {
    urgencyBoost = 8;
  }

  const retryBoost = Math.min((item.retryCount ?? 0) * 10, 30);

  const finalScore = Math.min(100, baseScore + slaBoost + urgencyBoost + retryBoost);

  let priority: PriorityScore["priority"];
  if (finalScore >= 85) {
    priority = "critical";
  } else if (finalScore >= 65) {
    priority = "high";
  } else if (finalScore >= 35) {
    priority = "medium";
  } else {
    priority = "low";
  }

  return {
    eventType: item.eventType,
    baseScore,
    slaBoost,
    urgencyBoost,
    retryBoost,
    finalScore,
    priority,
  };
}

export function sortByPriority(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    const scoreA = calculatePriority(a).finalScore;
    const scoreB = calculatePriority(b).finalScore;
    return scoreB - scoreA;
  });
}
