// GET  /api/admin/idxf-adoption — shadow-validation agreement, divergences, enforcement readiness
// POST /api/admin/idxf-adoption — entity_report | observations | clear_observations | simulate
// Admin-only; tenant-scoped.
//
// Reports on the IDXF shadow rollout: where the runtime's validation agrees with the existing
// route checks, where it is stricter, and whether enforcement can be enabled safely. Shadow
// observations are recorded by instrumented write paths and never affect a request.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  getAdoptionReport,
  getAdoptionSummary,
  getObservations,
  clearObservations,
  shadowValidate,
  ADOPTION_THRESHOLDS,
  type ShadowVerdict,
} from "@/lib/idxf-integration/shadow-validator";
import { getAllEntities, getEntity } from "@/lib/metadata/entity-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_VERDICTS: ShadowVerdict[] = [
  "agreed_accept", "agreed_reject", "idxf_stricter", "idxf_permissive", "shadow_error",
];

/** Write paths currently reporting shadow observations. */
const INSTRUMENTED_SOURCES = [
  { source: "api.jobs.create", entity: "job" },
  { source: "api.reviews.create", entity: "review" },
  { source: "api.disputes.create", entity: "dispute" },
  { source: "api.payments.intent", entity: "payment" },
];

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
  const entity = url.searchParams.get("entity");

  if (entity) {
    if (!getEntity(entity)) {
      return NextResponse.json(
        { error: `Unknown entity '${entity}'`, knownEntities: getAllEntities().map((e) => e.key) },
        { status: 404 }
      );
    }
    return NextResponse.json({
      report: getAdoptionReport(entity, tenantId),
      thresholds: ADOPTION_THRESHOLDS,
      generatedAt: new Date().toISOString(),
    });
  }

  // Observations are recorded with the tenant that produced them; a tenant admin
  // sees only their own, super_admin sees the platform-wide picture.
  const summary = getAdoptionSummary(isSuperAdmin ? undefined : tenantId);

  return NextResponse.json({
    summary,
    instrumentedSources: INSTRUMENTED_SOURCES,
    uninstrumentedEntities: getAllEntities()
      .map((e) => e.key)
      .filter((key) => !INSTRUMENTED_SOURCES.some((s) => s.entity === key)),
    thresholds: ADOPTION_THRESHOLDS,
    scope: isSuperAdmin ? "platform" : "tenant",
    note:
      "Shadow validation observes only — no request has ever been blocked by IDXF. Enforcement is a separate, per-entity decision informed by these figures.",
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
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
  const { action } = raw;

  if (action === "entity_report") {
    const { entity } = raw;
    if (typeof entity !== "string" || !getEntity(entity)) {
      return NextResponse.json(
        { error: "entity required and must be registered", knownEntities: getAllEntities().map((e) => e.key) },
        { status: 400 }
      );
    }
    const report = getAdoptionReport(entity, isSuperAdmin ? undefined : tenantId);
    return NextResponse.json({
      action,
      report,
      thresholds: ADOPTION_THRESHOLDS,
      // readyToEnforce is advisory — it reports that the evidence supports
      // enforcement, not that anything has been switched on.
      note: "readyToEnforce describes evidence sufficiency only; no enforcement is enabled by this endpoint.",
      success: true,
    });
  }

  if (action === "observations") {
    const { entity, verdict, limit } = raw;
    if (entity !== undefined && (typeof entity !== "string" || !getEntity(entity))) {
      return NextResponse.json({ error: "entity must be a registered entity" }, { status: 400 });
    }
    if (verdict !== undefined && !VALID_VERDICTS.includes(verdict as ShadowVerdict)) {
      return NextResponse.json(
        { error: `verdict must be one of: ${VALID_VERDICTS.join(", ")}` },
        { status: 400 }
      );
    }
    return NextResponse.json({
      action,
      observations: getObservations({
        ...(typeof entity === "string" ? { entity } : {}),
        ...(verdict ? { verdict: verdict as ShadowVerdict } : {}),
        // A tenant admin may only read observations produced by their own tenant.
        ...(isSuperAdmin ? {} : { tenantId }),
        ...(typeof limit === "number" ? { limit: Math.min(limit, 200) } : {}),
      }),
      success: true,
    });
  }

  if (action === "clear_observations") {
    // Clearing discards the evidence base for every tenant, so it is restricted.
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: "Forbidden — clearing shadow observations discards platform-wide evidence and requires super_admin" },
        { status: 403 }
      );
    }
    const { entity } = raw;
    if (entity !== undefined && (typeof entity !== "string" || !getEntity(entity))) {
      return NextResponse.json({ error: "entity must be a registered entity" }, { status: 400 });
    }
    const removed = clearObservations(typeof entity === "string" ? entity : undefined);
    return NextResponse.json({ action, removed, success: true });
  }

  if (action === "simulate") {
    // Runs a payload through the shadow comparison without a live request, so a
    // suspected divergence can be reproduced and inspected directly.
    const { entity, record, legacyAccepted } = raw;
    if (typeof entity !== "string" || !getEntity(entity)) {
      return NextResponse.json(
        { error: "entity required and must be registered", knownEntities: getAllEntities().map((e) => e.key) },
        { status: 400 }
      );
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return NextResponse.json({ error: "record object required" }, { status: 400 });
    }
    if (typeof legacyAccepted !== "boolean") {
      return NextResponse.json(
        { error: "legacyAccepted must be a boolean — state what the existing route would have done" },
        { status: 400 }
      );
    }
    const observation = shadowValidate(entity, record as Record<string, unknown>, {
      tenantId,
      legacyAccepted,
      source: "api.admin.idxf-adoption.simulate",
    });
    return NextResponse.json(
      {
        action,
        observation,
        // Simulated runs enter the same buffer as real ones, so they influence
        // the adoption figures. Say so rather than letting them skew silently.
        note: "This observation is recorded alongside real traffic and counts toward the adoption report.",
        success: true,
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'entity_report', 'observations', 'clear_observations', or 'simulate'.`,
    },
    { status: 400 }
  );
}
