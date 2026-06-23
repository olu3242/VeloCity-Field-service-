// Membership Growth Intelligence — read-time cross-sell/upsell/plan-upgrade/
// expansion computation over real job history, membership_usage, and
// membership_plan_pricing (Rule 2: no synthetic scoring; Rule 1: no new
// growth engine, reuses the existing read-time-computation pattern from
// providerGrowthIntelligence.ts). Surfaced via NovaAgent.recommendMembershipGrowth().

import { getAdminClient } from "@/lib/supabase/admin";
import type { MembershipPlanSummary } from "./membershipCatalog";
import { listMembershipPlans } from "./membershipCatalog";

export interface CrossSellOpportunity {
  planId: string;
  planName: string;
  reason: string;
  matchedJobsLast180Days: number;
}

export interface UpsellOpportunity {
  subscriptionId: string;
  entitlementId: string;
  serviceTypeName: string;
  usedThisPeriod: number;
  includedThisPeriod: number;
  reason: string;
}

export interface PlanUpgradeOpportunity {
  subscriptionId: string;
  currentBillingFrequency: string;
  recommendedBillingFrequency: string;
  currentAnnualizedCostCents: number;
  recommendedAnnualizedCostCents: number;
  savingsCents: number;
}

export interface ExpansionOpportunity {
  planId: string;
  planName: string;
  reason: string;
  matchedJobsLast180Days: number;
}

export interface MembershipGrowthReport {
  customerId: string;
  crossSellOpportunities: CrossSellOpportunity[];
  upsellOpportunities: UpsellOpportunity[];
  planUpgradeOpportunities: PlanUpgradeOpportunity[];
  expansionOpportunities: ExpansionOpportunity[];
  expectedRevenueImpactCents: number;
}

const ANNUALIZED_PERIODS: Record<string, number> = { monthly: 12, quarterly: 4, annual: 1 };

export async function computeMembershipGrowthIntelligence(customerId: string): Promise<MembershipGrowthReport> {
  const db = getAdminClient();
  const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: subscriptions }, { data: customerJobs }, allPlans] = await Promise.all([
    db
      .from("membership_subscriptions")
      .select("id, plan_id, billing_frequency, amount_cents, status, current_period_start, current_period_end")
      .eq("customer_id", customerId),
    db
      .from("jobs")
      .select("id, category, service_type_id, created_at")
      .eq("customer_id", customerId)
      .in("status", ["completed", "customer_confirmed"])
      .gte("created_at", oneEightyDaysAgo),
    listMembershipPlans(),
  ]);

  const activeSubscriptions = (subscriptions ?? []).filter((s) => s.status === "active");
  const ownedPlanIds = new Set(activeSubscriptions.map((s) => s.plan_id));
  const jobs = customerJobs ?? [];

  const matchedJobsForPlan = (plan: MembershipPlanSummary) => {
    const serviceTypeIds = new Set(plan.entitlements.map((e) => e.serviceTypeId));
    return jobs.filter((j) => j.service_type_id && serviceTypeIds.has(j.service_type_id)).length;
  };

  const crossSellOpportunities: CrossSellOpportunity[] = [];
  const expansionOpportunities: ExpansionOpportunity[] = [];

  for (const plan of allPlans) {
    if (ownedPlanIds.has(plan.id)) continue;
    const matchedJobs = matchedJobsForPlan(plan);
    if (matchedJobs < 2) continue;

    const target = ownedPlanIds.size > 0 ? crossSellOpportunities : expansionOpportunities;
    const reason =
      ownedPlanIds.size > 0
        ? `Customer booked ${matchedJobs} job(s) in ${plan.name}-covered service types over the last 180 days but has no active ${plan.name} membership`
        : `Customer booked ${matchedJobs} job(s) matching ${plan.name} entitlements over the last 180 days with no active membership`;

    if (target === crossSellOpportunities) {
      crossSellOpportunities.push({ planId: plan.id, planName: plan.name, reason, matchedJobsLast180Days: matchedJobs });
    } else {
      expansionOpportunities.push({ planId: plan.id, planName: plan.name, reason, matchedJobsLast180Days: matchedJobs });
    }
  }

  const upsellOpportunities: UpsellOpportunity[] = [];
  for (const sub of activeSubscriptions) {
    const plan = allPlans.find((p) => p.id === sub.plan_id);
    if (!plan) continue;
    const cappedEntitlements = plan.entitlements.filter((e) => e.includedUsesPerPeriod !== null);
    if (!cappedEntitlements.length) continue;

    const { data: usageRows } = await db
      .from("membership_usage")
      .select("entitlement_id")
      .eq("subscription_id", sub.id)
      .gte("period_start", sub.current_period_start)
      .lte("period_end", sub.current_period_end);

    for (const entitlement of cappedEntitlements) {
      const usedThisPeriod = (usageRows ?? []).filter((u) => u.entitlement_id === entitlement.id).length;
      if (usedThisPeriod >= (entitlement.includedUsesPerPeriod ?? 0)) {
        upsellOpportunities.push({
          subscriptionId: sub.id,
          entitlementId: entitlement.id,
          serviceTypeName: entitlement.serviceTypeName,
          usedThisPeriod,
          includedThisPeriod: entitlement.includedUsesPerPeriod ?? 0,
          reason: `Customer has used all ${entitlement.includedUsesPerPeriod} included ${entitlement.serviceTypeName} visit(s) this period — recommend a higher-tier plan with unlimited coverage`,
        });
      }
    }
  }

  const planUpgradeOpportunities: PlanUpgradeOpportunity[] = [];
  for (const sub of activeSubscriptions) {
    const plan = allPlans.find((p) => p.id === sub.plan_id);
    if (!plan) continue;
    const currentAnnualized = sub.amount_cents * (ANNUALIZED_PERIODS[sub.billing_frequency] ?? 12);

    for (const pricing of plan.pricing) {
      if (pricing.billingFrequency === sub.billing_frequency) continue;
      const candidateAnnualized = pricing.priceCents * (ANNUALIZED_PERIODS[pricing.billingFrequency] ?? 12);
      if (candidateAnnualized < currentAnnualized) {
        planUpgradeOpportunities.push({
          subscriptionId: sub.id,
          currentBillingFrequency: sub.billing_frequency,
          recommendedBillingFrequency: pricing.billingFrequency,
          currentAnnualizedCostCents: Math.round(currentAnnualized),
          recommendedAnnualizedCostCents: Math.round(candidateAnnualized),
          savingsCents: Math.round(currentAnnualized - candidateAnnualized),
        });
      }
    }
  }

  const crossSellImpact = crossSellOpportunities.reduce((sum, o) => {
    const plan = allPlans.find((p) => p.id === o.planId);
    const cheapest = plan?.pricing.reduce((m, p) => Math.min(m, p.priceCents * (ANNUALIZED_PERIODS[p.billingFrequency] ?? 12)), Infinity);
    return sum + (Number.isFinite(cheapest) ? (cheapest as number) : 0);
  }, 0);
  const expansionImpact = expansionOpportunities.reduce((sum, o) => {
    const plan = allPlans.find((p) => p.id === o.planId);
    const cheapest = plan?.pricing.reduce((m, p) => Math.min(m, p.priceCents * (ANNUALIZED_PERIODS[p.billingFrequency] ?? 12)), Infinity);
    return sum + (Number.isFinite(cheapest) ? (cheapest as number) : 0);
  }, 0);
  // Plan-upgrade (billing-frequency) opportunities trade a per-unit discount
  // for a longer prepaid commitment — they reduce near-term churn risk
  // rather than adding new revenue, so they are surfaced as recommendations
  // but intentionally excluded from expectedRevenueImpactCents (no double
  // counting of a customer's existing spend as "new" revenue).
  const expectedRevenueImpactCents = Math.round(crossSellImpact + expansionImpact);

  return {
    customerId,
    crossSellOpportunities,
    upsellOpportunities,
    planUpgradeOpportunities,
    expansionOpportunities,
    expectedRevenueImpactCents,
  };
}
