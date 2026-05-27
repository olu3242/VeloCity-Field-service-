// Anomaly Detection Engine
// Identifies operational anomalies across queue, payments, providers, and disputes.

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface Anomaly {
  type: string;
  severity: AnomalySeverity;
  message: string;
  value: number;
  threshold: number;
  recommendation: string;
}

export interface AnomalyReport {
  anomalies: Anomaly[];
  hasHighSeverity: boolean;
  hasCritical: boolean;
  summary: string;
}

function anomaly(
  type: string,
  severity: AnomalySeverity,
  message: string,
  value: number,
  threshold: number,
  recommendation: string
): Anomaly {
  return { type, severity, message, value, threshold, recommendation };
}

// ── Queue anomalies ───────────────────────────────────────────────────────

export function detectQueueAnomalies(input: {
  pendingCount: number;
  failedCount: number;
  processingCount: number;
  oldestPendingAgeMs: number | null;
  avgProcessingTimeMs?: number;
}): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (input.pendingCount > 200) {
    anomalies.push(anomaly("queue_flood", "critical", `Queue has ${input.pendingCount} pending items`, input.pendingCount, 200, "Check worker health and scale horizontally if needed."));
  } else if (input.pendingCount > 50) {
    anomalies.push(anomaly("queue_pressure", "high", `Queue pressure: ${input.pendingCount} pending`, input.pendingCount, 50, "Monitor worker throughput — consider increasing batch size."));
  }

  if (input.failedCount > 20) {
    anomalies.push(anomaly("queue_failures", "critical", `${input.failedCount} permanently failed items`, input.failedCount, 20, "Investigate handler errors in audit_logs. Dead-letter review needed."));
  } else if (input.failedCount > 5) {
    anomalies.push(anomaly("queue_failures", "high", `${input.failedCount} failed queue items`, input.failedCount, 5, "Review error patterns in automation_queue."));
  }

  if (input.oldestPendingAgeMs !== null && input.oldestPendingAgeMs > 900_000) {
    const ageMin = Math.round(input.oldestPendingAgeMs / 60_000);
    anomalies.push(anomaly("queue_stale", "high", `Oldest pending item is ${ageMin} minutes old`, ageMin, 15, "Worker may be stuck. Check processAutomationQueue logs."));
  }

  return anomalies;
}

// ── Payment anomalies ─────────────────────────────────────────────────────

export function detectPaymentAnomalies(input: {
  failedPaymentsLast24h: number;
  chargebacksLast7d: number;
  pendingPayoutsCents: number;
  avgJobValueCents: number;
  refundRateLast30d: number;
}): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (input.failedPaymentsLast24h > 10) {
    anomalies.push(anomaly("payment_failures", "critical", `${input.failedPaymentsLast24h} failed payments in 24h`, input.failedPaymentsLast24h, 10, "Check Stripe dashboard for processor issues. Notify FINN."));
  } else if (input.failedPaymentsLast24h > 3) {
    anomalies.push(anomaly("payment_failures", "medium", `${input.failedPaymentsLast24h} failed payments today`, input.failedPaymentsLast24h, 3, "Monitor — may indicate card decline patterns."));
  }

  if (input.chargebacksLast7d > 5) {
    anomalies.push(anomaly("chargeback_spike", "critical", `${input.chargebacksLast7d} chargebacks in 7 days`, input.chargebacksLast7d, 5, "Immediate fraud review required. Consider stricter verification."));
  }

  if (input.pendingPayoutsCents > 500_000_00) {
    const amountK = Math.round(input.pendingPayoutsCents / 100_000);
    anomalies.push(anomaly("payout_backlog", "high", `$${amountK}K in pending payouts`, amountK, 5000, "Release payout batch — providers may be affected."));
  }

  if (input.refundRateLast30d > 0.08) {
    anomalies.push(anomaly("high_refund_rate", "high", `Refund rate is ${(input.refundRateLast30d * 100).toFixed(1)}%`, input.refundRateLast30d * 100, 8, "Investigate service quality issues. Review dispute patterns with IVY."));
  }

  return anomalies;
}

// ── Provider anomalies ────────────────────────────────────────────────────

export function detectProviderAnomalies(input: {
  noShowRateLast30d: number;
  disputeRateLast30d: number;
  avgAcceptanceRate: number;
  activeProvidersCount: number;
  unacceptedOffersLast24h: number;
}): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (input.noShowRateLast30d > 0.05) {
    anomalies.push(anomaly("provider_no_shows", "high", `No-show rate is ${(input.noShowRateLast30d * 100).toFixed(1)}%`, input.noShowRateLast30d * 100, 5, "Flag providers with repeat no-shows for REX review."));
  }

  if (input.disputeRateLast30d > 0.12) {
    anomalies.push(anomaly("provider_disputes", "high", `Provider dispute rate is ${(input.disputeRateLast30d * 100).toFixed(1)}%`, input.disputeRateLast30d * 100, 12, "Quality review required. Consider provider training or suspension."));
  }

  if (input.unacceptedOffersLast24h > input.activeProvidersCount * 0.3) {
    anomalies.push(anomaly("offer_rejection_spike", "medium", `High offer rejection rate — ${input.unacceptedOffersLast24h} unaccepted offers`, input.unacceptedOffersLast24h, 0, "Provider supply may be insufficient. Alert TESS for territory review."));
  }

  return anomalies;
}

// ── Aggregate all anomalies ───────────────────────────────────────────────

export function buildAnomalyReport(anomalies: Anomaly[]): AnomalyReport {
  const sorted = anomalies.sort((a, b) => {
    const order: Record<AnomalySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  const hasCritical = sorted.some(a => a.severity === "critical");
  const hasHighSeverity = sorted.some(a => a.severity === "high" || a.severity === "critical");

  const summary = sorted.length === 0
    ? "No anomalies detected — platform operating normally."
    : `${sorted.length} anomaly${sorted.length > 1 ? "ies" : ""} detected${hasCritical ? " — CRITICAL action required" : hasHighSeverity ? " — review recommended" : ""}.`;

  return { anomalies: sorted, hasHighSeverity, hasCritical, summary };
}
