// GET /api/idxf/{entity} — metadata-driven list for any registered entity
//
// One route serves every business object. Columns, filterable fields, sort keys
// and masking all come from entity metadata, so registering a new entity makes
// it listable here with no route changes.
//
// Reads only. Writing generically would bypass the domain routes that own each
// table's business logic — quote pricing, dispatch, payout rules — so create and
// update deliberately have no generic path.
//
// Tenant isolation is the caller's RLS-scoped client: this route never uses the
// service role, so the database enforces the boundary rather than a filter this
// code could forget.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getEntity, getAllEntities } from "@/lib/metadata/entity-registry";
import { getEntityFields } from "@/lib/metadata/field-engine";
import {
  listEntity,
  REPOSITORY_LIMITS,
  type Filter,
  type FilterOperator,
  type RepositoryClient,
} from "@/lib/idxf-integration/entity-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_OPERATORS: FilterOperator[] = ["eq", "in", "gte", "lte", "contains"];

/** Query params that configure the request rather than filter it. */
const RESERVED_PARAMS = new Set(["limit", "offset", "sortBy", "sortDesc", "compute", "select"]);

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

/**
 * Parses `field:operator=value` style params into filters.
 * An unparseable filter is an error rather than being ignored — silently
 * dropping a filter would return more rows than the caller asked for.
 */
function parseFilters(
  url: URL,
  entity: string
): { filters: Filter[]; error?: string } {
  const filters: Filter[] = [];
  const declared = new Set(getEntityFields(entity).map((f) => f.name));

  for (const [key, value] of Array.from(url.searchParams.entries())) {
    if (RESERVED_PARAMS.has(key)) continue;

    const [field, rawOperator] = key.split(":");
    if (!field) continue;

    if (!declared.has(field)) {
      return {
        filters: [],
        error: `'${field}' is not a declared field on '${entity}'`,
      };
    }

    const operator = (rawOperator ?? "eq") as FilterOperator;
    if (!VALID_OPERATORS.includes(operator)) {
      return {
        filters: [],
        error: `Unknown operator '${rawOperator}' — use one of: ${VALID_OPERATORS.join(", ")}`,
      };
    }

    filters.push({
      field,
      operator,
      value: operator === "in" ? value.split(",") : value,
    });
  }

  return { filters };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const auth = await requireAuth();
  if (auth.error || !auth.profile || !auth.supabase) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { entity } = await params;
  const definition = getEntity(entity);
  if (!definition) {
    return NextResponse.json(
      { error: `Unknown entity '${entity}'`, knownEntities: getAllEntities().map((e) => e.key) },
      { status: 404 }
    );
  }

  // Resolved for the tenant-integrity check below; RLS does the enforcing.
  getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";

  const url = new URL(request.url);
  const { filters, error: filterError } = parseFilters(url, entity);
  if (filterError) {
    return NextResponse.json(
      {
        error: filterError,
        filterableFields: getEntityFields(entity)
          .filter((f) => !f.sensitive && !(f.readOnly && (f.formula || f.aggregate)))
          .map((f) => f.name),
      },
      { status: 400 }
    );
  }

  const limitParam = url.searchParams.get("limit");
  const offsetParam = url.searchParams.get("offset");
  const sortBy = url.searchParams.get("sortBy");

  const result = await listEntity(auth.supabase as unknown as RepositoryClient, entity, {
    filters,
    ...(sortBy ? { sortBy } : {}),
    sortDescending: url.searchParams.get("sortDesc") === "true",
    ...(limitParam ? { limit: Number(limitParam) } : {}),
    ...(offsetParam ? { offset: Number(offsetParam) } : {}),
    computeDerived: url.searchParams.get("compute") === "true",
    // Only super_admin may see sensitive values; every other caller gets masks.
    unmaskSensitive: isSuperAdmin,
  });

  if (!result.ok) {
    const status = result.error.code === "unknown_entity" ? 404
      : result.error.code === "query_failed" ? 500
      : 400;
    return NextResponse.json({ error: result.error.message, code: result.error.code, ...(result.error.knownFields ? { knownFields: result.error.knownFields } : {}) }, { status });
  }

  return NextResponse.json({
    ...result.data,
    // Aggregates need related rows a list query does not load, so `compute`
    // resolves formulas only — say so rather than returning silent nulls.
    ...(url.searchParams.get("compute") === "true"
      ? { computeNote: "Formula fields computed; aggregate fields require the single-record endpoint." }
      : {}),
    generatedAt: new Date().toISOString(),
  });
}
