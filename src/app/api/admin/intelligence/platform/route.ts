// GET /api/admin/intelligence/platform — platform-wide intelligence insights
// Reads from enterprise_memory (persisted) + in-memory insight store.
// Admin-only; super_admin sees cross-tenant data.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { getRecentInsights, generatePlatformSummary } from "@/lib/global-intelligence/cross-tenant-insights";
import { getTopAnomalousEvents, getAnomaliesByTenant } from "@/lib/event-intelligence/anomaly-scorer";

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
  const isSuperAdmin = auth.profile.role === "super_admin";

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const supabase = getAdminClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Query persisted entries from enterprise_memory
  let query = supabase
    .from("enterprise_memory")
    .select("id, category, entity_type, entity_id, summary, detail, tags, importance, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!isSuperAdmin) {
    query = query.eq("tenant_id", tenantId);
  }

  if (category) {
    query = query.eq("category", category);
  } else {
    // Default: show intelligence-related categories
    query = query.in("category", ["platform_insight", "event_anomaly", "copilot_query"]);
  }

  const { data: memoryEntries } = await query;

  // In-memory intelligence (supplement persisted)
  const inMemoryInsights = getRecentInsights(20);
  const platformSummary = generatePlatformSummary();
  const topAnomalies = isSuperAdmin
    ? getTopAnomalousEvents(10)
    : getAnomaliesByTenant(tenantId).slice(0, 10);

  // Count by category from persisted entries
  const categoryCounts: Record<string, number> = {};
  for (const entry of memoryEntries ?? []) {
    const cat = (entry as { category: string }).category;
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  return NextResponse.json({
    tenantId,
    isSuperAdmin,
    persisted: {
      entries: memoryEntries ?? [],
      total: memoryEntries?.length ?? 0,
      categoryCounts,
    },
    inMemory: {
      insights: inMemoryInsights,
      summary: platformSummary,
      topAnomalies,
    },
    generatedAt: new Date().toISOString(),
  });
}
