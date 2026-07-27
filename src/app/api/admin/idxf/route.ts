// GET  /api/admin/idxf — runtime stats, entity catalogue, configuration issues, certification
// POST /api/admin/idxf — describe_entity | build_form | build_workspace | run_pipeline
//                        | validate | calculate | lookup | related | quality | duplicates
//                        | explain | recommend | certify | capture_schema
// Admin-only; tenant-scoped.
//
// This is the HTTP surface of the Intelligent Data Experience Framework. Every
// action reads entity behaviour from metadata, so a new business object becomes
// fully operable here the moment it is registered — no route changes required.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  runPipeline,
  certifyEntity,
  certifyPlatform,
  describeEntityMetadata,
  getRuntimeStats,
  getRuntimeIssues,
  captureSchema,
  PIPELINE_STAGES,
} from "@/lib/registry/metadata-api";
import { getAllEntities, getEntity } from "@/lib/metadata/entity-registry";
import { getEntityFields } from "@/lib/metadata/field-engine";
import { validateRecord, VALIDATION_STAGES, type ValidationStage } from "@/lib/validation/validation-engine";
import { calculate, createAggregateResolver } from "@/lib/calculation/calculation-runtime";
import { describeDependencyGraph } from "@/lib/calculation/dependency-engine";
import { buildForm } from "@/lib/forms/dynamic-form-engine";
import { buildWorkspace, describeWorkspace, UNIVERSAL_TABS } from "@/lib/workspace/workspace-engine";
import { lookup, lookupForField, recommended } from "@/lib/lookup/lookup-engine";
import { indexRecords } from "@/lib/lookup/search-index";
import { getRelated, relationshipScore, RELATED_VIEWS } from "@/lib/related/related-engine";
import { buildGraph, buildHierarchy } from "@/lib/related/relationship-graph";
import { scoreQuality, scoreBatch } from "@/lib/quality/quality-engine";
import { detectDuplicates } from "@/lib/quality/duplicate-engine";
import { assist, ASSISTANT_CAPABILITIES, type AssistantCapability } from "@/lib/ai/field-assistant";
import { recommendForField, type CandidateInput } from "@/lib/ai/recommendation-engine";
import { BREAKPOINTS, type Breakpoint } from "@/lib/forms/layout-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Record<string, unknown> => r !== null && typeof r === "object");
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, userId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, userId: user.id };
}

/** Rejects an unknown entity before any engine is invoked. */
function requireKnownEntity(entity: unknown): { ok: true; entity: string } | { ok: false; response: NextResponse } {
  if (typeof entity !== "string" || entity.trim() === "") {
    return { ok: false, response: NextResponse.json({ error: "entity required" }, { status: 400 }) };
  }
  if (!getEntity(entity)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Unknown entity '${entity}'`, knownEntities: getAllEntities().map((e) => e.key) },
        { status: 404 }
      ),
    };
  }
  return { ok: true, entity };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");

  if (entity) {
    const check = requireKnownEntity(entity);
    if (!check.ok) return check.response;
    return NextResponse.json({
      metadata: describeEntityMetadata(check.entity),
      workspace: describeWorkspace(check.entity),
      dependencyGraph: describeDependencyGraph(check.entity),
      generatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    entities: getAllEntities().map((e) => ({
      key: e.key,
      label: e.label,
      domain: e.domain,
      table: e.table,
      tenantScoped: e.tenantScoped,
      fieldCount: getEntityFields(e.key).length,
    })),
    stats: getRuntimeStats(tenantId),
    issues: getRuntimeIssues(),
    certification: certifyPlatform(),
    graph: buildGraph(),
    supported: {
      pipelineStages: PIPELINE_STAGES,
      validationStages: VALIDATION_STAGES,
      relatedViews: RELATED_VIEWS,
      workspaceTabs: UNIVERSAL_TABS,
      breakpoints: BREAKPOINTS,
      assistantCapabilities: ASSISTANT_CAPABILITIES,
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const userId = auth.userId;
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

  // ── Metadata ────────────────────────────────────────────────────────────

  if (action === "describe_entity") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    return NextResponse.json({
      action,
      metadata: describeEntityMetadata(check.entity),
      workspace: describeWorkspace(check.entity),
      success: true,
    });
  }

  if (action === "capture_schema") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const snapshot = captureSchema(
      check.entity,
      typeof raw.note === "string" ? raw.note : undefined
    );
    return NextResponse.json({ action, snapshot, success: true }, { status: 201 });
  }

  // ── Form runtime ────────────────────────────────────────────────────────

  if (action === "build_form") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const breakpoint = raw.breakpoint;
    if (breakpoint !== undefined && !BREAKPOINTS.includes(breakpoint as Breakpoint)) {
      return NextResponse.json(
        { error: `breakpoint must be one of: ${BREAKPOINTS.join(", ")}` },
        { status: 400 }
      );
    }
    const form = buildForm(check.entity, asRecord(raw.record), {
      ...(breakpoint ? { breakpoint: breakpoint as Breakpoint } : {}),
      ...(Array.isArray(raw.visibleFields) ? { visibleFields: raw.visibleFields as string[] } : {}),
      validate: raw.validate === true,
      ...(raw.defaultContext
        ? { defaultContext: { ...asRecord(raw.defaultContext), tenantId, userId, record: asRecord(raw.record) } }
        : {}),
    });
    return NextResponse.json({ action, form, success: true });
  }

  if (action === "build_workspace") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const workspace = buildWorkspace(check.entity, asRecord(raw.record), {
      ...(Array.isArray(raw.visibleFields) ? { visibleFields: raw.visibleFields as string[] } : {}),
      includeValidation: raw.includeValidation === true,
      ...(raw.qualityOptions ? { qualityOptions: asRecord(raw.qualityOptions) } : {}),
    });
    return NextResponse.json({ action, workspace, success: true });
  }

  // ── Pipeline ────────────────────────────────────────────────────────────

  if (action === "run_pipeline") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;

    const stage = raw.stage;
    if (stage !== undefined && !VALIDATION_STAGES.includes(stage as ValidationStage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${VALIDATION_STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    // This surface never persists: writing through a generic admin endpoint
    // would bypass the domain routes that own each table's business logic.
    // The pipeline runs as a dry run so callers can inspect the full verdict.
    const result = runPipeline(check.entity, asRecord(raw.record), {
      tenantId,
      userId,
      ...(stage ? { stage: stage as ValidationStage } : {}),
      ...(Array.isArray(raw.writableFields) ? { writableFields: raw.writableFields as string[] } : {}),
      ...(raw.relatedRows
        ? { aggregateResolver: createAggregateResolver(asRecord(raw.relatedRows) as Record<string, Array<Record<string, unknown>>>) }
        : {}),
      ...(raw.duplicateCandidates ? { duplicateCandidates: asRows(raw.duplicateCandidates) } : {}),
      ...(raw.qualityOptions ? { qualityOptions: asRecord(raw.qualityOptions) } : {}),
    });

    return NextResponse.json(
      {
        action,
        result,
        dryRun: true,
        note: "No persistence is performed through this endpoint — use the domain route for the entity to write.",
        success: result.validation?.valid ?? false,
      },
      { status: result.validation?.valid ? 200 : 422 }
    );
  }

  // ── Validation & calculation ────────────────────────────────────────────

  if (action === "validate") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const stage = raw.stage;
    if (stage !== undefined && !VALIDATION_STAGES.includes(stage as ValidationStage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${VALIDATION_STAGES.join(", ")}` },
        { status: 400 }
      );
    }
    const result = validateRecord(check.entity, asRecord(raw.record), {
      ...(stage ? { stage: stage as ValidationStage } : {}),
    });
    return NextResponse.json(
      { action, result, success: result.valid },
      { status: result.valid ? 200 : 422 }
    );
  }

  if (action === "calculate") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const result = calculate(check.entity, asRecord(raw.record), {
      ...(Array.isArray(raw.changedFields) ? { changedFields: raw.changedFields as string[] } : {}),
      ...(raw.relatedRows
        ? { aggregateResolver: createAggregateResolver(asRecord(raw.relatedRows) as Record<string, Array<Record<string, unknown>>>) }
        : {}),
    });
    // A circular dependency skips calculation entirely — report it as a conflict
    // rather than returning an unchanged record as though it succeeded.
    const blocked = result.cyclesDetected.length > 0;
    return NextResponse.json(
      { action, result, success: !blocked },
      { status: blocked ? 409 : 200 }
    );
  }

  // ── Lookup ──────────────────────────────────────────────────────────────

  if (action === "index_records") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const rows = asRows(raw.rows);
    if (rows.length === 0) {
      return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
    }
    // Always indexed under the caller's tenant — a supplied tenantId is ignored,
    // so one tenant cannot inject documents into another's index.
    const indexed = indexRecords(check.entity, tenantId, rows);
    return NextResponse.json({ action, indexed, skipped: rows.length - indexed, success: true }, { status: 201 });
  }

  if (action === "lookup") {
    const { entity, field, query } = raw;
    if (typeof query !== "string") {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const check = requireKnownEntity(entity);
    if (!check.ok) return check.response;

    const limit = typeof raw.limit === "number" ? Math.min(raw.limit, 50) : 10;

    // A field-scoped lookup takes its target entity and activeOnly from
    // metadata, so the caller cannot widen the constraint.
    if (typeof field === "string" && field !== "") {
      try {
        const response = lookupForField(check.entity, field, {
          tenantId,
          userId,
          query,
          limit,
          ...(raw.fuzzy === true ? { fuzzy: true } : {}),
        });
        return NextResponse.json({ action, response, success: true });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Lookup failed" },
          { status: 400 }
        );
      }
    }

    const response = lookup({
      tenantId,
      userId,
      entity: check.entity,
      query,
      limit,
      ...(raw.activeOnly === true ? { activeOnly: true } : {}),
      ...(raw.fuzzy === true ? { fuzzy: true } : {}),
    });
    return NextResponse.json({ action, response, success: true });
  }

  if (action === "recommended") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    return NextResponse.json({
      action,
      suggestions: recommended(tenantId, userId, check.entity, typeof raw.limit === "number" ? raw.limit : 5),
      success: true,
    });
  }

  // ── Related ─────────────────────────────────────────────────────────────

  if (action === "related") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const recordId = raw.recordId;
    if (typeof recordId !== "string" || recordId === "") {
      return NextResponse.json({ error: "recordId required" }, { status: 400 });
    }
    const view = raw.view;
    if (view !== undefined && !RELATED_VIEWS.includes(view as (typeof RELATED_VIEWS)[number])) {
      return NextResponse.json(
        { error: `view must be one of: ${RELATED_VIEWS.join(", ")}` },
        { status: 400 }
      );
    }
    const result = getRelated(check.entity, recordId, {
      ...(view ? { view: view as (typeof RELATED_VIEWS)[number] } : {}),
    });
    return NextResponse.json({
      action,
      result,
      // Rows are not fetched here: loading them needs a tenant-scoped query that
      // belongs to the entity's own domain route.
      note: "Relationship structure and counts only — row loading belongs to the entity's domain route.",
      success: true,
    });
  }

  if (action === "relationship_score") {
    const { from, to } = raw;
    if (typeof from !== "string" || typeof to !== "string") {
      return NextResponse.json({ error: "from and to required" }, { status: 400 });
    }
    return NextResponse.json({ action, score: relationshipScore(from, to), success: true });
  }

  if (action === "hierarchy") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const depth = typeof raw.depth === "number" ? Math.min(Math.max(1, raw.depth), 5) : 3;
    return NextResponse.json({ action, hierarchy: buildHierarchy(check.entity, depth), success: true });
  }

  // ── Quality & duplicates ────────────────────────────────────────────────

  if (action === "quality") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;

    const records = asRows(raw.records);
    if (records.length > 0) {
      return NextResponse.json({
        action,
        batch: scoreBatch(check.entity, records, asRecord(raw.options)),
        success: true,
      });
    }

    const report = scoreQuality(check.entity, asRecord(raw.record), asRecord(raw.options));
    return NextResponse.json({ action, report, success: true });
  }

  if (action === "duplicates") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const candidates = asRows(raw.candidates);
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "candidates must be a non-empty array of tenant-scoped rows" },
        { status: 400 }
      );
    }
    const report = detectDuplicates(check.entity, asRecord(raw.record), candidates, {
      ...(typeof raw.minProbability === "number" ? { minProbability: raw.minProbability } : {}),
    });
    return NextResponse.json({ action, report, success: true });
  }

  // ── AI ──────────────────────────────────────────────────────────────────

  if (action === "explain") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const capability = raw.capability;
    if (!ASSISTANT_CAPABILITIES.includes(capability as AssistantCapability)) {
      return NextResponse.json(
        { error: `capability must be one of: ${ASSISTANT_CAPABILITIES.join(", ")}` },
        { status: 400 }
      );
    }
    try {
      const response = assist(check.entity, capability as AssistantCapability, asRecord(raw.record), {
        ...(typeof raw.field === "string" ? { field: raw.field } : {}),
        ...(raw.defaultContext
          ? { defaultContext: { ...asRecord(raw.defaultContext), tenantId, userId, record: asRecord(raw.record) } }
          : {}),
      });
      return NextResponse.json({ action, response, success: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Assistant failed" },
        { status: 400 }
      );
    }
  }

  if (action === "recommend") {
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const field = raw.field;
    if (typeof field !== "string" || field === "") {
      return NextResponse.json({ error: "field required" }, { status: 400 });
    }
    const candidates = asRows(raw.candidates) as unknown as CandidateInput[];
    if (candidates.length === 0) {
      return NextResponse.json({ error: "candidates must be a non-empty array" }, { status: 400 });
    }
    try {
      const result = recommendForField(check.entity, field, candidates, {
        ...(typeof raw.limit === "number" ? { limit: Math.min(raw.limit, 25) } : {}),
      });
      return NextResponse.json({ action, result, success: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Recommendation failed" },
        { status: 400 }
      );
    }
  }

  // ── Certification ───────────────────────────────────────────────────────

  if (action === "certify") {
    if (raw.entity === undefined) {
      return NextResponse.json({ action, platform: certifyPlatform(), success: true });
    }
    const check = requireKnownEntity(raw.entity);
    if (!check.ok) return check.response;
    const report = certifyEntity(check.entity);
    return NextResponse.json(
      { action, report, success: report.certified },
      { status: report.certified ? 200 : 422 }
    );
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'describe_entity', 'capture_schema', 'build_form', 'build_workspace', 'run_pipeline', 'validate', 'calculate', 'index_records', 'lookup', 'recommended', 'related', 'relationship_score', 'hierarchy', 'quality', 'duplicates', 'explain', 'recommend', or 'certify'.`,
    },
    { status: 400 }
  );
}
