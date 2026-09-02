// Membership Revenue Intelligence — read-time computation over
// membership_subscriptions/membership_events/revenue_records (Rule 1: no
// new revenue engine; Rule 3: every figure traces to a real subscription or
// revenue_records row). Surfaced via FinnAgent.calculateRecurringRevenue().

import { getAdminClient } from "@/lib/supabase/admin";

export interface MembershipPlanProfitability {
  planId: string;
  planName: string;
  activeSubscriptions: number;
  collectedRevenueCents: number;
  fulfillmentCostCents: number;
  profitabilityCents: number;
}

export interface RecurringRevenueReport {
  mrrCents: number;
  arrCents: number;
  renewalRate: number;
  churnRate: number;
  expansionRevenueCents: number;
  forecastedNextPeriodRevenueCents: number;
  planProfitability: MembershipPlanProfitability[];
}

const MONTHLY_EQUIVALENT: Record<string, number> = {
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
};

export async function computeRecurringRevenueIntelligence(tenantId: string): Promise<RecurringRevenueReport> {
  const db = getAdminClient();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: activeSubs }, { data: recentEvents }, { data: plans }] = await Promise.all([
    db
      .from("membership_subscriptions")
      .select("id, plan_id, billing_frequency, amount_cents, status, started_at, current_period_end")
      .eq("tenant_id", tenantId),
    db
      .from("membership_events")
      .select("subscription_id, event_type, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    db.from("membership_plans").select("id, name").eq("tenant_id", tenantId),
  ]);

  const subs = activeSubs ?? [];
  const active = subs.filter((s) => s.status === "active");

  const mrrCents = Math.round(
    active.reduce((sum, s) => sum + s.amount_cents * (MONTHLY_EQUIVALENT[s.billing_frequency] ?? 1), 0)
  );
  const arrCents = mrrCents * 12;

  const events = recentEvents ?? [];
  const renewedCount = events.filter((e) => e.event_type === "membership_renewed").length;
  const cancelledCount = events.filter((e) => e.event_type === "membership_cancelled").length;
  const expiringOrRenewedTotal = renewedCount + cancelledCount;

  const renewalRate = expiringOrRenewedTotal > 0 ? Math.round((renewedCount / expiringOrRenewedTotal) * 1000) / 10 : 0;
  const subscriptionBaseForChurn = Math.max(subs.length, 1);
  const churnRate = Math.round((cancelledCount / subscriptionBaseForChurn) * 1000) / 10;

  // Expansion revenue: real upgrades, i.e. subscriptions whose current
  // amount_cents exceeds their plan's lowest-tier pricing at the same
  // billing frequency — computed only from real plan_pricing rows.
  const { data: pricingRows } = await db
    .from("membership_plan_pricing")
    .select("plan_id, billing_frequency, price_cents")
    .eq("tenant_id", tenantId);
  const baselinePrice = new Map<string, number>();
  for (const row of pricingRows ?? []) {
    const key = `${row.plan_id}:${row.billing_frequency}`;
    const existing = baselinePrice.get(key);
    if (existing === undefined || row.price_cents < existing) baselinePrice.set(key, row.price_cents);
  }
  const expansionRevenueCents = active.reduce((sum, s) => {
    const baseline = baselinePrice.get(`${s.plan_id}:${s.billing_frequency}`) ?? s.amount_cents;
    return sum + Math.max(0, s.amount_cents - baseline);
  }, 0);

  const forecastedNextPeriodRevenueCents = Math.round(mrrCents * (1 + (renewalRate - churnRate) / 100));

  const planProfitability: MembershipPlanProfitability[] = [];
  for (const plan of plans ?? []) {
    const planSubs = active.filter((s) => s.plan_id === plan.id);
    if (!planSubs.length) continue;
    const collectedRevenueCents = planSubs.reduce(
      (sum, s) => sum + s.amount_cents * (MONTHLY_EQUIVALENT[s.billing_frequency] ?? 1),
      0
    );

    const { data: revenueRows } = await db
      .from("revenue_records")
      .select("provider_payout_cents")
      .eq("tenant_id", tenantId)
      .in(
        "membership_subscription_id",
        planSubs.map((s) => s.id)
      );
    const fulfillmentCostCents = (revenueRows ?? []).reduce((sum, r) => sum + (r.provider_payout_cents ?? 0), 0);

    planProfitability.push({
      planId: plan.id,
      planName: plan.name,
      activeSubscriptions: planSubs.length,
      collectedRevenueCents: Math.round(collectedRevenueCents),
      fulfillmentCostCents,
      profitabilityCents: Math.round(collectedRevenueCents) - fulfillmentCostCents,
    });
  }

  return {
    mrrCents,
    arrCents,
    renewalRate,
    churnRate,
    expansionRevenueCents,
    forecastedNextPeriodRevenueCents,
    planProfitability,
  };
}
