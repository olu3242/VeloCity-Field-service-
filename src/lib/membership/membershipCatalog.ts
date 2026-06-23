// Membership Catalog — read-only access to membership_plans/
// membership_plan_pricing/membership_entitlements. Every benefit returned
// here references a real service_types/service_packages row (Rule 2); no
// benefit text is hardcoded in application code.

import { getAdminClient } from "@/lib/supabase/admin";

export interface MembershipPlanEntitlement {
  id: string;
  serviceTypeId: string;
  serviceTypeName: string;
  servicePackageId: string | null;
  includedUsesPerPeriod: number | null;
  period: "monthly" | "quarterly" | "annual" | "plan_term";
  isPriorityScheduling: boolean;
  benefitDescription: string | null;
}

export interface MembershipPlanPricingOption {
  id: string;
  billingFrequency: "monthly" | "quarterly" | "annual";
  priceCents: number;
}

export interface MembershipPlanSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricing: MembershipPlanPricingOption[];
  entitlements: MembershipPlanEntitlement[];
}

export async function listMembershipPlans(): Promise<MembershipPlanSummary[]> {
  const db = getAdminClient();

  const { data: plans } = await db
    .from("membership_plans")
    .select("id, name, slug, description")
    .eq("is_active", true);

  if (!plans?.length) return [];

  const planIds = plans.map((p) => p.id);

  const [{ data: pricingRows }, { data: entitlementRows }] = await Promise.all([
    db
      .from("membership_plan_pricing")
      .select("id, plan_id, billing_frequency, price_cents")
      .in("plan_id", planIds)
      .eq("is_active", true),
    db
      .from("membership_entitlements")
      .select("id, plan_id, service_type_id, service_package_id, included_uses_per_period, period, is_priority_scheduling, benefit_description, service_types(name)")
      .in("plan_id", planIds),
  ]);

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    pricing: (pricingRows ?? [])
      .filter((r: { plan_id: string }) => r.plan_id === plan.id)
      .map((r: { id: string; billing_frequency: string; price_cents: number }) => ({
        id: r.id,
        billingFrequency: r.billing_frequency as MembershipPlanPricingOption["billingFrequency"],
        priceCents: r.price_cents,
      })),
    entitlements: (entitlementRows ?? [])
      .filter((r: { plan_id: string }) => r.plan_id === plan.id)
      .map((r: any) => ({
        id: r.id,
        serviceTypeId: r.service_type_id,
        serviceTypeName: r.service_types?.name ?? "Unknown",
        servicePackageId: r.service_package_id,
        includedUsesPerPeriod: r.included_uses_per_period,
        period: r.period,
        isPriorityScheduling: r.is_priority_scheduling,
        benefitDescription: r.benefit_description,
      })),
  }));
}

export async function getMembershipPlanBySlug(slug: string): Promise<MembershipPlanSummary | null> {
  const plans = await listMembershipPlans();
  return plans.find((p) => p.slug === slug) ?? null;
}
