import type { CommandCenterMetrics, RecommendedAction } from "./types";

export function buildRecommendedActions(metrics: CommandCenterMetrics): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (metrics.unassignedJobs > 0) {
    actions.push({
      id: "assign-unassigned-jobs",
      priority: metrics.unassignedJobs > 5 ? "critical" : "high",
      title: "Assign unassigned jobs",
      owner: "ops",
      reason: `${metrics.unassignedJobs} jobs are waiting for provider coverage.`,
      auditEvent: "command_center.assign_unassigned_jobs",
      href: "/admin/jobs",
    });
  }

  if (metrics.paymentFailures > 0) {
    actions.push({
      id: "resolve-payment-failures",
      priority: "high",
      title: "Resolve payment failures",
      owner: "finance",
      reason: `${metrics.paymentFailures} failed payments can block job progress or payout.`,
      auditEvent: "command_center.resolve_payment_failures",
    });
  }

  if (metrics.providerSupplyGaps > 0) {
    actions.push({
      id: "recruit-provider-supply",
      priority: metrics.providerSupplyGaps > 3 ? "high" : "medium",
      title: "Recruit provider supply",
      owner: "provider",
      reason: `${metrics.providerSupplyGaps} category or territory supply gaps detected.`,
      auditEvent: "command_center.recruit_provider_supply",
      href: "/admin/growth",
    });
  }

  if (metrics.churnRisk > 50) {
    actions.push({
      id: "launch-retention-save",
      priority: "medium",
      title: "Launch retention save motion",
      owner: "customer_success",
      reason: `Customer churn risk is ${metrics.churnRisk}/100.`,
      auditEvent: "command_center.launch_retention_save",
    });
  }

  if (metrics.failedAutomations > 0) {
    actions.push({
      id: "review-failed-automations",
      priority: "high",
      title: "Review failed automations",
      owner: "automation",
      reason: `${metrics.failedAutomations} failed automations need deterministic fallback review.`,
      auditEvent: "command_center.review_failed_automations",
    });
  }

  if (metrics.pricingFlags > 0 || metrics.revenueLeakageAlerts > 0) {
    actions.push({
      id: "review-pricing-flags",
      priority: metrics.pricingFlags > 5 || metrics.revenueLeakageAlerts > 2 ? "high" : "medium",
      title: "Review pricing flags",
      owner: "finance",
      reason: `${metrics.pricingFlags} quote/pricing flags and ${metrics.revenueLeakageAlerts} revenue leakage alerts need review.`,
      auditEvent: "command_center.review_pricing_flags",
      href: "/admin/pricing",
    });
  }

  if (metrics.payoutHolds > 0) {
    actions.push({
      id: "review-payout-holds",
      priority: "high",
      title: "Review payout holds",
      owner: "finance",
      reason: `${metrics.payoutHolds} payouts are held pending dispute, risk, or manual review.`,
      auditEvent: "command_center.review_payout_holds",
      href: "/admin/payouts",
    });
  }

  if (metrics.refundRisk > 0) {
    actions.push({
      id: "review-refund-risk",
      priority: metrics.refundRisk > 3 ? "high" : "medium",
      title: "Review refund risk",
      owner: "finance",
      reason: `${metrics.refundRisk} refund or chargeback records may affect payout decisions.`,
      auditEvent: "command_center.review_refund_risk",
      href: "/admin/payments",
    });
  }

  if (metrics.territoryReadiness >= 70) {
    actions.push({
      id: "evaluate-franchise-territory",
      priority: "medium",
      title: "Evaluate franchise territory",
      owner: "growth",
      reason: `Territory readiness is ${metrics.territoryReadiness}/100.`,
      auditEvent: "command_center.evaluate_franchise_territory",
      href: "/admin/growth",
    });
  }

  return actions.length ? actions : [
    {
      id: "monitor-command-center",
      priority: "low",
      title: "Monitor operating posture",
      owner: "ops",
      reason: "No urgent blockers detected from current metrics.",
      auditEvent: "command_center.monitor",
    },
  ];
}
