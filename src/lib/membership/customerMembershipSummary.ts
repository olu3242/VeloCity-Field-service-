// Customer Membership Summary — read-time view for the customer dashboard
// (Phase 11). Extends the existing customer dashboard, not a separate
// membership portal, per Rule 1.

import { getAdminClient } from "@/lib/supabase/admin";

export interface CustomerMembershipEntitlementUsage {
  entitlementId: string;
  serviceTypeName: string;
  includedUsesPerPeriod: number | null;
  usedThisPeriod: number;
  isPriorityScheduling: boolean;
  benefitDescription: string | null;
}

export interface CustomerMembershipSummary {
  subscriptionId: string;
  planName: string;
  billingFrequency: string;
  status: string;
  currentPeriodEnd: string;
  nextServiceDate: string | null;
  entitlements: CustomerMembershipEntitlementUsage[];
  savingsRealizedCents: number;
}

export async function computeCustomerMembershipSummary(customerId: string): Promise<CustomerMembershipSummary[]> {
  const db = getAdminClient();

  const { data: subscriptions } = await db
    .from("membership_subscriptions")
    .select("id, plan_id, billing_frequency, status, current_period_start, current_period_end, next_service_date, membership_plans(name)")
    .eq("customer_id", customerId)
    .order("started_at", { ascending: false });

  if (!subscriptions?.length) return [];

  const summaries: CustomerMembershipSummary[] = [];

  for (const sub of subscriptions) {
    const [{ data: entitlements }, { data: usageRows }] = await Promise.all([
      db
        .from("membership_entitlements")
        .select("id, included_uses_per_period, is_priority_scheduling, benefit_description, service_types(name)")
        .eq("plan_id", sub.plan_id),
      db
        .from("membership_usage")
        .select("entitlement_id, job_id")
        .eq("subscription_id", sub.id)
        .gte("period_start", sub.current_period_start)
        .lte("period_end", sub.current_period_end),
    ]);

    const usageJobIds = (usageRows ?? []).map((u) => u.job_id).filter((id): id is string => Boolean(id));
    let savingsRealizedCents = 0;
    if (usageJobIds.length) {
      const { data: usageJobs } = await db.from("jobs").select("id, category, final_cost_cents").in("id", usageJobIds);
      const categories = Array.from(new Set((usageJobs ?? []).map((j) => j.category)));
      if (categories.length) {
        const { data: platformJobs } = await db
          .from("jobs")
          .select("category, final_cost_cents")
          .in("category", categories)
          .in("status", ["completed", "customer_confirmed"])
          .not("final_cost_cents", "is", null)
          .limit(500);
        const avgByCategory = new Map<string, number>();
        for (const category of categories) {
          const rows = (platformJobs ?? []).filter((j) => j.category === category && j.final_cost_cents);
          if (rows.length) {
            avgByCategory.set(
              category,
              rows.reduce((sum, j) => sum + (j.final_cost_cents ?? 0), 0) / rows.length
            );
          }
        }
        for (const job of usageJobs ?? []) {
          // Only count as savings when the membership-linked job was not
          // separately billed (final_cost_cents null/0 because the entitlement
          // covered it) — avoids double-counting real revenue as "savings".
          if (!job.final_cost_cents) {
            savingsRealizedCents += Math.round(avgByCategory.get(job.category) ?? 0);
          }
        }
      }
    }

    summaries.push({
      subscriptionId: sub.id,
      planName: (sub as any).membership_plans?.name ?? "Membership",
      billingFrequency: sub.billing_frequency,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      nextServiceDate: sub.next_service_date,
      entitlements: (entitlements ?? []).map((e: any) => ({
        entitlementId: e.id,
        serviceTypeName: e.service_types?.name ?? "Unknown",
        includedUsesPerPeriod: e.included_uses_per_period,
        usedThisPeriod: (usageRows ?? []).filter((u) => u.entitlement_id === e.id).length,
        isPriorityScheduling: e.is_priority_scheduling,
        benefitDescription: e.benefit_description,
      })),
      savingsRealizedCents,
    });
  }

  return summaries;
}
