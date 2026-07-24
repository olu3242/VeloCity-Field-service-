// GET  /api/admin/certifications — list all provider certifications for the tenant
// POST /api/admin/certifications — evaluate/re-evaluate a provider's certification
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { evaluateProviderCertification } from "@/lib/certifications/evaluateCertifications";

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
  const category = url.searchParams.get("category");
  const activeOnly = url.searchParams.get("activeOnly") !== "false";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  const db = getAdminClient();

  // Join through providers to enforce tenant boundary
  let query = db
    .from("provider_certifications")
    .select(`
      id, provider_id, category, tier, is_active, awarded_at, revoked_at, updated_at,
      providers!inner(tenant_id, business_name)
    `)
    .eq("providers.tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (providerId) query = query.eq("provider_id", providerId);
  if (category) query = query.eq("category", category);
  if (activeOnly) query = query.eq("is_active", true);

  const { data: certifications, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Summary: count by tier
  const tierCounts: Record<string, number> = {};
  for (const c of certifications ?? []) {
    const tier = (c as { tier: string }).tier;
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  return NextResponse.json({
    tenantId,
    certifications: certifications ?? [],
    summary: {
      total: certifications?.length ?? 0,
      byTier: tierCounts,
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

  const { provider_id, category } = body as Record<string, unknown>;

  if (typeof provider_id !== "string" || !provider_id) {
    return NextResponse.json({ error: "provider_id required" }, { status: 400 });
  }

  if (typeof category !== "string" || !category) {
    return NextResponse.json({ error: "category required" }, { status: 400 });
  }

  // Verify the provider belongs to this tenant
  const db = getAdminClient();
  const { data: provider } = await db
    .from("providers")
    .select("id, tenant_id")
    .eq("id", provider_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  try {
    const result = await evaluateProviderCertification(provider_id, category);
    return NextResponse.json({
      success: true,
      result,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}
