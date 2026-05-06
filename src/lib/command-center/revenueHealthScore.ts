import { buildScore, type CommandCenterMetrics, type CommandCenterScore } from "./types";

export function calculateRevenueHealthScore(metrics: CommandCenterMetrics): CommandCenterScore {
  const takeRate = metrics.gmvCents ? metrics.commissionRevenueCents / metrics.gmvCents : 0;
  const averageJobValue = metrics.averageJobValueCents / 100;
  const paymentPenalty = metrics.paymentFailures * 12 + metrics.payoutQueue * 2;
  const score = 50 + takeRate * 180 + Math.min(20, averageJobValue / 40) - paymentPenalty;

  return buildScore(
    score,
    [
      `GMV is ${metrics.gmvCents} cents with ${metrics.commissionRevenueCents} cents commission revenue.`,
      `Average job value is ${metrics.averageJobValueCents} cents.`,
      `${metrics.paymentFailures} payment failures are reducing revenue health.`,
    ],
    [
      "Resolve failed payments before dispatching additional high-value work.",
      "Review low-margin categories and commission leakage.",
      "Keep payout queue current to maintain provider liquidity.",
    ]
  );
}
