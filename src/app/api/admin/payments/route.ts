// GET  /api/admin/payments — payment ledger with filtering, refund records, fee summary
// POST /api/admin/payments — trigger a refund or mark a payment as failed
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { calculatePlatformFee } from "@/lib/payments/calculatePlatformFee";

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
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const since = url.searchParams.get("since") ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getAdminClient();

  // Core payments table
  let paymentQuery = supabase
    .from("payments")
    .select("id, job_id, customer_id, provider_id, amount_cents, type, status, stripe_payment_intent_id, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) paymentQuery = paymentQuery.eq("status", status);
  const { data: payments } = await paymentQuery;

  // Refund records
  const { data: refunds } = await supabase
    .from("refund_records")
    .select("id, payment_id, amount_cents, reason, status, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  // Revenue records for fee summary
  const { data: revenueRecords } = await supabase
    .from("revenue_records")
    .select("gross_amount_cents, platform_fee_cents, provider_payout_cents, net_platform_cents, settled")
    .eq("tenant_id", tenantId)
    .gte("created_at", since);

  // Aggregate fee summary
  const feeSummary = (revenueRecords ?? []).reduce(
    (acc, r) => {
      acc.grossCents += r.gross_amount_cents ?? 0;
      acc.platformFeeCents += r.platform_fee_cents ?? 0;
      acc.providerPayoutCents += r.provider_payout_cents ?? 0;
      acc.netPlatformCents += r.net_platform_cents ?? 0;
      if (!r.settled) acc.unsettledCount++;
      return acc;
    },
    { grossCents: 0, platformFeeCents: 0, providerPayoutCents: 0, netPlatformCents: 0, unsettledCount: 0 }
  );

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const p of payments ?? []) {
    const s = (p as { status: string }).status;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Fee calculation reference
  const sampleAmounts = [5000, 10000, 50000, 100000];
  const feeSchedule = sampleAmounts.map((cents) => ({
    amountCents: cents,
    feeCents: calculatePlatformFee(cents),
    feeRate: `${((calculatePlatformFee(cents) / cents) * 100).toFixed(0)}%`,
  }));

  return NextResponse.json({
    tenantId,
    since,
    payments: payments ?? [],
    refunds: refunds ?? [],
    feeSummary,
    statusCounts,
    feeSchedule,
    totals: {
      payments: payments?.length ?? 0,
      refunds: refunds?.length ?? 0,
    },
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

  const { action, paymentId, reason } = body as Record<string, unknown>;

  if (typeof paymentId !== "string") {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Verify payment belongs to this tenant
  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount_cents, status, tenant_id")
    .eq("id", paymentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  if (action === "refund") {
    const { error } = await supabase.from("refund_records").insert({
      payment_id: paymentId,
      tenant_id: tenantId,
      amount_cents: (payment as { amount_cents: number }).amount_cents,
      reason: typeof reason === "string" ? reason : "Admin-initiated refund",
      status: "pending",
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("payments")
      .update({ status: "refund_pending", updated_at: new Date().toISOString() })
      .eq("id", paymentId);

    return NextResponse.json({ success: true, action: "refund", paymentId });
  }

  if (action === "mark_failed") {
    const { error } = await supabase
      .from("payments")
      .update({ status: "payment_failed", updated_at: new Date().toISOString() })
      .eq("id", paymentId)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "mark_failed", paymentId });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
