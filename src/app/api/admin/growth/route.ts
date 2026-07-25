// GET /api/admin/growth — provider growth intelligence: revenue, pricing, service and geographic opportunities
// Requires ?providerId= query param.
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getAdminClient } from "@/lib/supabase/admin";
import { computeProviderGrowthIntelligence } from "@/lib/growth/providerGrowthIntelligence";

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
  const providerId = url.searchParams.get("providerId");

  if (providerId) {
    // Verify provider belongs to this tenant before computing intelligence.
    const db = getAdminClient();
    const { data: provider } = await db
      .from("providers")
      .select("id, tenant_id")
      .eq("id", providerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const report = await computeProviderGrowthIntelligence(providerId);
    return NextResponse.json({ tenantId, report, generatedAt: new Date().toISOString() });
  }

  // No providerId: return top providers with growth potential summary.
  const db = getAdminClient();
  const { data: providers } = await db
    .from("providers")
    .select("id, name, status")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .limit(20);

  return NextResponse.json({
    tenantId,
    providers: providers ?? [],
    hint: "Pass ?providerId= to compute full growth intelligence for a specific provider",
    generatedAt: new Date().toISOString(),
  });
}
