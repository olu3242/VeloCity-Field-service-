// Membership Retention Intelligence — read-time detection over
// membership_subscriptions/membership_usage/membership_events (Rule 1: no
// new retention engine; reuses the existing in-memory churnRisk scoring
// shape from src/lib/retention/churnRisk.ts as the per-customer risk
// signal). Surfaced via AliceAgent.assessMembershipRetention().

import { getAdminClient } from "@/lib/supabase/admin";
import { calculateChurnRisk } from "@/lib/retention/churnRisk";

export interface UpcomingRenewal {
  subscriptionId: string;
  customerId: string;
  planName: string;
  currentPeriodEnd: string;
  daysUntilRenewal: number;
}

export interface MissedService {
  subscriptionId: string;
  customerId: string;
  entitlementId: string;
  serviceTypeName: string;
  includedUsesPerPeriod: number;
  usedThisPeriod: number;
  periodEnd: string;
}

export interface InactiveMember {
  subscriptionId: string;
  customerId: string;
  daysSinceLastJob: number;
}

export interface AtRiskMember {
  subscriptionId: string;
  customerId: string;
  churnRiskScore: number;
  churnRiskLevel: string;
  reason: string;
}

export interface RetentionWorkflowAction {
  subscriptionId: string;
  customerId: string;
  action: "send_renewal_reminder" | "send_missed_service_reminder" | "send_winback_offer" | "escalate_to_retention_team";
  reason: string;
}

export interface MembershipRetentionReport {
  upcomingRenewals: UpcomingRenewal[];
  missedServices: MissedService[];
  inactiveMembers: InactiveMember[];
  atRiskMembers: AtRiskMember[];
  retentionWorkflows: RetentionWorkflowAction[];
}

export async function computeMembershipRetentionIntelligence(): Promise<MembershipRetentionReport> {
  const db = getAdminClient();
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: activeSubs } = await db
    .from("membership_subscriptions")
    .select("id, customer_id, plan_id, current_period_start, current_period_end, membership_plans(name)")
    .eq("status", "active");

  const subs = activeSubs ?? [];

  const upcomingRenewals: UpcomingRenewal[] = subs
    .filter((s: any) => s.current_period_end <= sevenDaysOut)
    .map((s: any) => ({
      subscriptionId: s.id,
      customerId: s.customer_id,
      planName: s.membership_plans?.name ?? "Unknown",
      currentPeriodEnd: s.current_period_end,
      daysUntilRenewal: Math.max(
        0,
        Math.round((new Date(s.current_period_end).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      ),
    }));

  const missedServices: MissedService[] = [];
  const inactiveMembers: InactiveMember[] = [];
  const atRiskMembers: AtRiskMember[] = [];

  for (const sub of subs) {
    const [{ data: entitlements }, { data: usageRows }, { data: lastJobs }, { data: disputes }, { data: reviews }] =
      await Promise.all([
        db
          .from("membership_entitlements")
          .select("id, included_uses_per_period, service_types(name)")
          .eq("plan_id", sub.plan_id)
          .not("included_uses_per_period", "is", null),
        db
          .from("membership_usage")
          .select("entitlement_id")
          .eq("subscription_id", sub.id)
          .gte("period_start", sub.current_period_start)
          .lte("period_end", sub.current_period_end),
        db
          .from("jobs")
          .select("id, created_at")
          .eq("customer_id", sub.customer_id)
          .order("created_at", { ascending: false })
          .limit(1),
        db.from("disputes").select("id").eq("customer_id", sub.customer_id).eq("status", "open"),
        db.from("reviews").select("rating").eq("customer_id", sub.customer_id).order("created_at", { ascending: false }).limit(1),
      ]);

    const periodEndDate = new Date(sub.current_period_end);
    const daysLeftInPeriod = (periodEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

    for (const entitlement of entitlements ?? []) {
      const usedThisPeriod = (usageRows ?? []).filter((u) => u.entitlement_id === entitlement.id).length;
      // Flag as missed only when fewer than half the included uses have
      // been consumed with less than a quarter of the period remaining.
      if (daysLeftInPeriod >= 0 && daysLeftInPeriod <= 30 && usedThisPeriod < (entitlement.included_uses_per_period ?? 0) / 2) {
        missedServices.push({
          subscriptionId: sub.id,
          customerId: sub.customer_id,
          entitlementId: entitlement.id,
          serviceTypeName: (entitlement as any).service_types?.name ?? "Unknown",
          includedUsesPerPeriod: entitlement.included_uses_per_period ?? 0,
          usedThisPeriod,
          periodEnd: sub.current_period_end,
        });
      }
    }

    const lastJob = lastJobs?.[0];
    const daysSinceLastJob = lastJob
      ? Math.round((now.getTime() - new Date(lastJob.created_at).getTime()) / (24 * 60 * 60 * 1000))
      : 9999;

    if (daysSinceLastJob > 120) {
      inactiveMembers.push({ subscriptionId: sub.id, customerId: sub.customer_id, daysSinceLastJob });
    }

    const risk = calculateChurnRisk({
      daysSinceLastJob,
      completedJobs: lastJobs?.length ?? 0,
      lastRating: reviews?.[0]?.rating ?? 5,
      openDisputes: disputes?.length ?? 0,
    });
    if (risk.level === "high") {
      atRiskMembers.push({
        subscriptionId: sub.id,
        customerId: sub.customer_id,
        churnRiskScore: risk.score,
        churnRiskLevel: risk.level,
        reason: risk.reason,
      });
    }
  }

  const retentionWorkflows: RetentionWorkflowAction[] = [
    ...upcomingRenewals.map((r) => ({
      subscriptionId: r.subscriptionId,
      customerId: r.customerId,
      action: "send_renewal_reminder" as const,
      reason: `${r.planName} renews in ${r.daysUntilRenewal} day(s)`,
    })),
    ...missedServices.map((m) => ({
      subscriptionId: m.subscriptionId,
      customerId: m.customerId,
      action: "send_missed_service_reminder" as const,
      reason: `Customer has used only ${m.usedThisPeriod}/${m.includedUsesPerPeriod} included ${m.serviceTypeName} visits with the period ending soon`,
    })),
    ...inactiveMembers.map((m) => ({
      subscriptionId: m.subscriptionId,
      customerId: m.customerId,
      action: "send_winback_offer" as const,
      reason: `No job activity in ${m.daysSinceLastJob} days despite active membership`,
    })),
    ...atRiskMembers
      .filter((m) => m.churnRiskScore >= 85)
      .map((m) => ({
        subscriptionId: m.subscriptionId,
        customerId: m.customerId,
        action: "escalate_to_retention_team" as const,
        reason: m.reason,
      })),
  ];

  return { upcomingRenewals, missedServices, inactiveMembers, atRiskMembers, retentionWorkflows };
}
