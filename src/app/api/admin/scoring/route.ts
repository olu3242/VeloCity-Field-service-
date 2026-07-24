// GET /api/admin/scoring — composite operational scoring: job risk, provider health, platform pulse.
// Queries live Supabase data and feeds it into composite scoring functions.
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import {
  buildJobRiskProfile,
  buildProviderHealthProfile,
  buildOperationalPulse,
} from "@/lib/scoring/composite/operationalScoring";

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

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const db = getAdminClient();

  // Fetch live operational data in parallel
  const [
    queueResult,
    disputeResult,
    payoutResult,
    providersResult,
    openJobsResult,
  ] = await Promise.all([
    db
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "processing", "failed"]),

    db
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "open"),

    db
      .from("payout_ledger")
      .select("amount")
      .eq("tenant_id", tenantId)
      .eq("status", "payout_pending"),

    db
      .from("providers")
      .select("id, business_name, trust_score, completed_jobs, cancellation_rate, avg_rating, dispute_rate, no_show_rate")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")
      .limit(50),

    db
      .from("jobs")
      .select("id, customer_trust_score, provider_trust_score, amount_cents, has_active_dispute, urgency")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "confirmed", "in_progress"])
      .limit(50),
  ]);

  // Compute platform operational pulse
  const pendingEvents = queueResult.count ?? 0;
  const openDisputes = disputeResult.count ?? 0;
  const pendingPayoutsCents = (payoutResult.data ?? []).reduce(
    (s: number, p: { amount: number }) => s + (p.amount ?? 0),
    0
  );

  const pulse = buildOperationalPulse({
    pendingQueueItems: pendingEvents,
    processingQueueItems: 0,
    openDisputes,
    pendingPayoutsCents,
    failedQueueItems: 0,
  });

  // Provider health profiles for all approved providers
  type ProviderRow = {
    id: string;
    business_name: string | null;
    trust_score: number | null;
    completed_jobs: number | null;
    cancellation_rate: number | null;
    avg_rating: number | null;
    dispute_rate: number | null;
    no_show_rate: number | null;
  };

  const providers = (providersResult.data ?? []) as ProviderRow[];
  const providerProfiles = providers.map((p) => ({
    providerId: p.id,
    name: p.business_name ?? p.id.slice(0, 8),
    profile: buildProviderHealthProfile({
      trustScore: p.trust_score ?? undefined,
      completedJobs: p.completed_jobs ?? undefined,
      cancellationRate: p.cancellation_rate ?? undefined,
      averageRating: p.avg_rating ?? undefined,
      isApproved: true,
      disputeRate: p.dispute_rate ?? undefined,
      noShowRate: p.no_show_rate ?? undefined,
    }),
  }));

  const atRiskProviders = providerProfiles.filter(
    (p) => p.profile.overallHealth === "at_risk" || p.profile.overallHealth === "critical"
  );
  const suspendRecommended = providerProfiles.filter((p) => p.profile.suspendRecommended);

  // Job risk profiles for open jobs
  type JobRow = {
    id: string;
    customer_trust_score: number | null;
    provider_trust_score: number | null;
    amount_cents: number | null;
    has_active_dispute: boolean | null;
    urgency: string | null;
  };

  const openJobs = (openJobsResult.data ?? []) as JobRow[];
  const jobProfiles = openJobs.map((j) => ({
    jobId: j.id,
    profile: buildJobRiskProfile({
      customerTrustScore: j.customer_trust_score ?? undefined,
      providerTrustScore: j.provider_trust_score ?? undefined,
      amountCents: j.amount_cents ?? undefined,
      hasActiveDispute: j.has_active_dispute ?? false,
      urgency: j.urgency ?? undefined,
    }),
  }));

  const escalateJobs = jobProfiles.filter((j) => j.profile.escalate);

  return NextResponse.json({
    tenantId,
    pulse,
    providers: {
      total: providerProfiles.length,
      atRisk: atRiskProviders,
      suspendRecommended: suspendRecommended.map((p) => ({
        providerId: p.providerId,
        name: p.name,
        flags: p.profile.flags,
      })),
    },
    jobs: {
      total: openJobs.length,
      escalate: escalateJobs.map((j) => ({
        jobId: j.jobId,
        compositeScore: j.profile.composite.score,
        compositeLevel: j.profile.composite.level,
        flags: j.profile.flags,
      })),
    },
    generatedAt: new Date().toISOString(),
  });
}
