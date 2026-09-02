// GET  /api/admin/memberships — membership plans, recurring revenue, retention intelligence
// POST /api/admin/memberships — create_subscription | growth_intelligence | customer_summary
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { listMembershipPlans } from "@/lib/membership/membershipCatalog";
import { computeRecurringRevenueIntelligence } from "@/lib/membership/membershipRevenueIntelligence";
import { computeMembershipRetentionIntelligence } from "@/lib/membership/membershipRetentionIntelligence";
import { computeMembershipGrowthIntelligence } from "@/lib/membership/membershipGrowthIntelligence";
import { computeCustomerMembershipSummary } from "@/lib/membership/customerMembershipSummary";
import {
  createMembershipSubscription,
  type CreateMembershipSubscriptionInput,
} from "@/lib/membership/membershipLifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (customerId) {
    const summary = await computeCustomerMembershipSummary(customerId);
    return NextResponse.json({ tenantId, customerId, summary, generatedAt: new Date().toISOString() });
  }

  const [plans, revenue, retention] = await Promise.all([
    listMembershipPlans(tenantId),
    computeRecurringRevenueIntelligence(tenantId),
    computeMembershipRetentionIntelligence(tenantId),
  ]);

  return NextResponse.json({
    tenantId,
    plans,
    revenue,
    retention,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { action } = body as Record<string, unknown>;

  if (action === "create_subscription") {
    const { customerId, planId, planPricingId, billingFrequency, amountCents, stripeSubscriptionId } =
      body as Record<string, unknown>;

    if (
      typeof customerId !== "string" ||
      typeof planId !== "string" ||
      typeof planPricingId !== "string" ||
      typeof amountCents !== "number"
    ) {
      return NextResponse.json(
        { error: "customerId, planId, planPricingId, and amountCents required" },
        { status: 400 }
      );
    }

    const validFrequencies = ["monthly", "quarterly", "annual"];
    if (!validFrequencies.includes(billingFrequency as string)) {
      return NextResponse.json(
        { error: "billingFrequency must be monthly | quarterly | annual" },
        { status: 400 }
      );
    }

    const input: CreateMembershipSubscriptionInput = {
      customerId,
      planId,
      planPricingId,
      billingFrequency: billingFrequency as "monthly" | "quarterly" | "annual",
      amountCents,
      stripeSubscriptionId: typeof stripeSubscriptionId === "string" ? stripeSubscriptionId : null,
    };

    const subscription = await createMembershipSubscription(input);
    return NextResponse.json({ action: "create_subscription", subscription, success: true }, { status: 201 });
  }

  if (action === "growth_intelligence") {
    const { customerId } = body as Record<string, unknown>;
    if (typeof customerId !== "string") {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }
    const report = await computeMembershipGrowthIntelligence(customerId, tenantId);
    return NextResponse.json({ action: "growth_intelligence", report, success: true });
  }

  if (action === "customer_summary") {
    const { customerId } = body as Record<string, unknown>;
    if (typeof customerId !== "string") {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }
    const summary = await computeCustomerMembershipSummary(customerId);
    return NextResponse.json({ action: "customer_summary", summary, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'create_subscription', 'growth_intelligence', or 'customer_summary'.` },
    { status: 400 }
  );
}
