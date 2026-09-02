// GET  /api/admin/skills — a provider's computed skills and evidence, tier thresholds
// POST /api/admin/skills — compute_skill | recompute_provider
// Admin-only.
//
// Isolation note: computeProviderSkill() runs on the service-role client, which bypasses RLS,
// and neither `providers` nor `jobs` carries a tenant_id column. Ownership is therefore
// established by first reading the provider through the caller's own RLS-scoped client — if
// the database will not show it to them, the computation is refused. That uses the isolation
// the database already enforces rather than a column that does not exist.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  computeProviderSkill,
  type ProviderSkillResult,
} from "@/lib/skills/computeProviderSkills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Mirrors the tiers the skill engine derives, for client display. */
const SKILL_TIERS = [
  { tier: "expert", minJobs: 25, minRating: 4.5 },
  { tier: "proficient", minJobs: 10, minRating: 4.0 },
  { tier: "competent", minJobs: 3, minRating: 3.5 },
  { tier: "novice", minJobs: 0, minRating: 0 },
];

/** Recomputing every service type for a provider is a burst of writes; bound it. */
const MAX_SERVICE_TYPES_PER_REQUEST = 25;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, supabase: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, supabase: null };
  }

  return { error: null, status: 200 as const, profile, supabase };
}

/**
 * Confirms the caller can see this provider through their own RLS-scoped client.
 * Returns false for "does not exist" and "not visible to you" alike, so a probe
 * cannot confirm the existence of another tenant's providers.
 */
async function providerVisibleToCaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  providerId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("providers")
    .select("id")
    .eq("id", providerId)
    .maybeSingle();
  return data !== null;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");

  if (!providerId) {
    return NextResponse.json({
      tiers: SKILL_TIERS,
      scoring: {
        formula: "jobVolumeSignal (min(completedJobs/25, 1) × 60) + ratingSignal (avgRating/5 × 40)",
        maxScore: 100,
        note: "Scores are computed from real job, review and offer history — never assigned manually.",
      },
      limits: { maxServiceTypesPerRequest: MAX_SERVICE_TYPES_PER_REQUEST },
      generatedAt: new Date().toISOString(),
    });
  }

  if (!(await providerVisibleToCaller(auth.supabase, providerId))) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  // Reading stored skills through the caller's client keeps RLS in force.
  const { data: skills } = await auth.supabase
    .from("provider_skills")
    .select("id, service_type_id, proficiency_score, skill_tier, completed_jobs_count, average_rating, cancellation_rate, last_computed_at")
    .eq("provider_id", providerId);

  return NextResponse.json({
    providerId,
    skills: skills ?? [],
    tiers: SKILL_TIERS,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action, providerId } = raw;

  if (typeof providerId !== "string" || providerId.trim() === "") {
    return NextResponse.json({ error: "providerId required" }, { status: 400 });
  }

  // Gate before touching the service-role client.
  if (!(await providerVisibleToCaller(auth.supabase, providerId))) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  if (action === "compute_skill") {
    const { serviceTypeId } = raw;
    if (typeof serviceTypeId !== "string" || serviceTypeId.trim() === "") {
      return NextResponse.json({ error: "serviceTypeId required" }, { status: 400 });
    }

    const result = await computeProviderSkill(providerId, serviceTypeId);
    if (!result) {
      // A null return means the provider has no jobs for this service type, so
      // there is no evidence to score — distinct from a computation failure.
      return NextResponse.json(
        {
          action,
          providerId,
          serviceTypeId,
          result: null,
          error: "No job history for this provider and service type — nothing to score.",
          success: false,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ action, result, success: true }, { status: 201 });
  }

  if (action === "recompute_provider") {
    const { serviceTypeIds } = raw;
    if (!Array.isArray(serviceTypeIds) || serviceTypeIds.length === 0) {
      return NextResponse.json(
        { error: "serviceTypeIds must be a non-empty array" },
        { status: 400 }
      );
    }
    if (!serviceTypeIds.every((s) => typeof s === "string")) {
      return NextResponse.json({ error: "serviceTypeIds must contain only strings" }, { status: 400 });
    }
    if (serviceTypeIds.length > MAX_SERVICE_TYPES_PER_REQUEST) {
      return NextResponse.json(
        {
          error: `At most ${MAX_SERVICE_TYPES_PER_REQUEST} service types per request — each one performs a full history scan and two writes.`,
        },
        { status: 400 }
      );
    }

    const computed: ProviderSkillResult[] = [];
    const skipped: string[] = [];

    for (const serviceTypeId of serviceTypeIds as string[]) {
      const result = await computeProviderSkill(providerId, serviceTypeId);
      if (result) computed.push(result);
      else skipped.push(serviceTypeId);
    }

    return NextResponse.json({
      action,
      providerId,
      computed,
      // Service types with no job history are reported rather than silently
      // dropped, so a caller can tell "no evidence" from "not attempted".
      skipped,
      skippedReason: "No job history for these service types.",
      success: true,
    });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'compute_skill' or 'recompute_provider'.` },
    { status: 400 }
  );
}
