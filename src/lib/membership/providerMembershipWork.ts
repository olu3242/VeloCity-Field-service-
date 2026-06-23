// Provider Membership Work — read-time view of a provider's membership-
// driven workload (Phase 9: Dispatch & Provider Integration). Reuses the
// same jobs/revenue_records tables every other provider report reads from;
// no new dispatch or scheduling engine.

import { getAdminClient } from "@/lib/supabase/admin";

export interface UpcomingMembershipJob {
  jobId: string;
  customerId: string;
  category: string;
  scheduledStart: string | null;
  planName: string;
}

export interface ProviderMembershipWorkReport {
  upcomingMembershipJobs: UpcomingMembershipJob[];
  recurringCustomerCount: number;
  projectedMembershipRevenueCents: number;
}

export async function computeProviderMembershipWork(providerId: string): Promise<ProviderMembershipWorkReport> {
  const db = getAdminClient();

  const { data: jobs } = await db
    .from("jobs")
    .select("id, customer_id, category, scheduled_start, status, membership_subscription_id, membership_subscriptions(plan_id, membership_plans(name))")
    .eq("provider_id", providerId)
    .not("membership_subscription_id", "is", null)
    .in("status", ["scheduled", "accepted", "deposit_required", "deposit_paid", "en_route", "arrived"]);

  const upcomingMembershipJobs: UpcomingMembershipJob[] = (jobs ?? []).map((j: any) => ({
    jobId: j.id,
    customerId: j.customer_id,
    category: j.category,
    scheduledStart: j.scheduled_start,
    planName: j.membership_subscriptions?.membership_plans?.name ?? "Membership",
  }));

  const recurringCustomerCount = new Set((jobs ?? []).map((j: any) => j.customer_id)).size;

  const { data: revenueRows } = await db
    .from("revenue_records")
    .select("provider_payout_cents")
    .eq("provider_id", providerId)
    .not("membership_subscription_id", "is", null);

  const projectedMembershipRevenueCents = (revenueRows ?? []).reduce(
    (sum, r) => sum + (r.provider_payout_cents ?? 0),
    0
  );

  return { upcomingMembershipJobs, recurringCustomerCount, projectedMembershipRevenueCents };
}
