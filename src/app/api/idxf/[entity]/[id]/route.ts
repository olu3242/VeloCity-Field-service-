// GET /api/idxf/{entity}/{id} — metadata-driven single-record read
//
// Returns the row with calculated fields resolved. Unlike the list endpoint,
// this loads the related rows aggregate fields need, so an aggregate is either
// genuinely computed or reported as uncomputed — never fabricated as zero.
//
// Read-only, RLS-scoped, sensitive values masked unless the caller is
// super_admin.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getEntity, getAllEntities } from "@/lib/metadata/entity-registry";
import { getEntityFields, isCalculatedKind } from "@/lib/metadata/field-engine";
import { getRelationshipsFrom } from "@/lib/metadata/relationship-registry";
import {
  readEntity,
  loadRelated,
  type RepositoryClient,
} from "@/lib/idxf-integration/entity-repository";
import { validateRecord } from "@/lib/validation/validation-engine";
import { scoreQuality } from "@/lib/quality/quality-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null, supabase: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return { error: "Unauthorized", status: 401 as const, profile: null, supabase: null };

  return { error: null, status: 200 as const, profile, supabase };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error || !auth.profile || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { entity, id } = await params;
  const definition = getEntity(entity);
  if (!definition) {
    return NextResponse.json(
      { error: `Unknown entity '${entity}'`, knownEntities: getAllEntities().map((e) => e.key) },
      { status: 404 }
    );
  }

  getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const client = auth.supabase as unknown as RepositoryClient;

  const url = new URL(request.url);
  const withValidation = url.searchParams.get("validate") === "true";
  const withQuality = url.searchParams.get("quality") === "true";

  // Aggregate fields walk a relationship, so those rows are loaded before the
  // calculation pass. Without them an aggregate cannot be computed honestly.
  const aggregateFields = getEntityFields(entity).filter((f) => f.kind === "aggregate");
  const relatedRows: Record<string, Array<Record<string, unknown>>> = {};
  const failedRelationships: string[] = [];

  for (const field of aggregateFields) {
    const spec = field.aggregate;
    if (!spec) continue;
    if (relatedRows[spec.relationship]) continue;

    const relationship = getRelationshipsFrom(entity).find((r) => r.name === spec.relationship);
    if (!relationship) {
      failedRelationships.push(spec.relationship);
      continue;
    }

    const loaded = await loadRelated(client, relationship.to, relationship.foreignKey, id, {
      limit: 200,
      unmaskSensitive: isSuperAdmin,
    });

    if (!loaded.ok) {
      // A failed load must not become a zero aggregate — record the failure and
      // let the calculation runtime report the field as uncomputed.
      failedRelationships.push(spec.relationship);
      continue;
    }
    relatedRows[spec.relationship] = loaded.data;
  }

  const result = await readEntity(client, entity, id, {
    computeDerived: true,
    unmaskSensitive: isSuperAdmin,
    relatedRows,
  });

  if (!result.ok) {
    const status = result.error.code === "not_found" ? 404
      : result.error.code === "query_failed" ? 500
      : 400;
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status });
  }

  return NextResponse.json({
    entity,
    id,
    record: result.data.row,
    derived: {
      calculatedFields: getEntityFields(entity)
        .filter((f) => isCalculatedKind(f.kind))
        .map((f) => f.name),
      uncomputedFields: result.data.uncomputedFields,
      ...(failedRelationships.length > 0
        ? {
            failedRelationships,
            note: "Aggregates over these relationships could not be loaded and were left uncomputed rather than defaulted to zero.",
          }
        : {}),
    },
    maskedFields: result.data.maskedFields,
    ...(withValidation
      ? { validation: validateRecord(entity, result.data.row, { stage: "before_save" }) }
      : {}),
    ...(withQuality ? { quality: scoreQuality(entity, result.data.row) } : {}),
    generatedAt: new Date().toISOString(),
  });
}
