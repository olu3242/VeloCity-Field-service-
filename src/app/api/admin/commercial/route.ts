// GET  /api/admin/commercial — commercial revenue intelligence, account summary, dispatch priority
// POST /api/admin/commercial — create_account | dispatch_priority
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { computeCommercialRevenueIntelligence } from "@/lib/commercial/commercialRevenueIntelligence";
import { computeCommercialAccountSummary } from "@/lib/commercial/commercialAccountSummary";
import { computeCommercialDispatchPriority } from "@/lib/commercial/commercialDispatchIntelligence";
import { createCommercialAccount } from "@/lib/commercial/commercialAccountLifecycle";

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
  const accountId = url.searchParams.get("accountId");

  if (accountId) {
    // Verify the account belongs to this tenant
    const db = getAdminClient();
    const { data: account } = await db
      .from("commercial_accounts")
      .select("id, tenant_id")
      .eq("id", accountId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "Commercial account not found" }, { status: 404 });
    }

    const summary = await computeCommercialAccountSummary(accountId);
    return NextResponse.json({ tenantId, accountId, summary, generatedAt: new Date().toISOString() });
  }

  const revenue = await computeCommercialRevenueIntelligence(tenantId);
  return NextResponse.json({
    tenantId,
    revenue,
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

  if (action === "create_account") {
    const { name, accountType, primaryContactId } = body as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const validAccountTypes = ["commercial", "franchise_partner", "property_management"];
    const account = await createCommercialAccount({
      name,
      accountType: validAccountTypes.includes(accountType as string)
        ? (accountType as "commercial" | "franchise_partner" | "property_management")
        : "commercial",
      primaryContactId: typeof primaryContactId === "string" ? primaryContactId : undefined,
    });

    // Tag account with tenant
    const db = getAdminClient();
    if (account?.id) {
      await db.from("commercial_accounts").update({ tenant_id: tenantId }).eq("id", account.id);
    }

    return NextResponse.json({ action: "create_account", account, success: true }, { status: 201 });
  }

  if (action === "dispatch_priority") {
    const { jobId, candidateProviderIds } = body as Record<string, unknown>;
    if (typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const providers = Array.isArray(candidateProviderIds)
      ? (candidateProviderIds as string[]).filter((p) => typeof p === "string")
      : [];

    const priority = await computeCommercialDispatchPriority(jobId, providers);
    return NextResponse.json({ action: "dispatch_priority", priority, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'create_account' or 'dispatch_priority'.` },
    { status: 400 }
  );
}
