// POST /api/idxf/{entity}/lookup — ranked lookup against any registered entity
//
// Completes the API surface the workspace descriptor advertises. Search ranking,
// recency and favorites all come from the Universal Lookup Engine; this route
// supplies the tenant-scoped rows it needs.
//
// The search index is in-memory and empty on process boot, so a lookup against a
// cold index would return nothing while behaving correctly. This route detects
// that and populates the index from RLS-scoped rows before searching, rather
// than reporting an empty result that looks like "no matches".

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getEntity, getAllEntities } from "@/lib/metadata/entity-registry";
import { getSearchableFields } from "@/lib/metadata/field-engine";
import { lookup, lookupForField, recommended } from "@/lib/lookup/lookup-engine";
import { getIndexStats } from "@/lib/lookup/search-index";
import { syncEntity, type RowLoader } from "@/lib/idxf-integration/index-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Rows pulled into the index when it is cold. */
const COLD_START_LIMIT = 500;

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 as const, profile: null, supabase: null, userId: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { error: "Unauthorized", status: 401 as const, profile: null, supabase: null, userId: null };
  }

  return { error: null, status: 200 as const, profile, supabase, userId: user.id };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const auth = await requireAuth();
  if (auth.error || !auth.profile || !auth.supabase || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { entity } = await params;
  if (!getEntity(entity)) {
    return NextResponse.json(
      { error: `Unknown entity '${entity}'`, knownEntities: getAllEntities().map((e) => e.key) },
      { status: 404 }
    );
  }

  const tenantId = getTenantId(auth.profile);
  const userId = auth.userId;
  const supabase = auth.supabase;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const { query, field, limit, fuzzy, activeOnly } = raw;

  // An entity with nothing searchable can never match, whatever the query.
  if (getSearchableFields(entity).length === 0) {
    return NextResponse.json(
      {
        entity,
        results: [],
        error: `'${entity}' declares no searchable fields, so lookup cannot match anything.`,
        noSearchableFields: true,
      },
      { status: 422 }
    );
  }

  // Suggestions before a query is typed — favorites, then recency.
  if (query === undefined || (typeof query === "string" && query.trim() === "")) {
    return NextResponse.json({
      entity,
      mode: "recommended",
      suggestions: recommended(tenantId, userId, entity, typeof limit === "number" ? Math.min(limit, 25) : 5),
      generatedAt: new Date().toISOString(),
    });
  }

  if (typeof query !== "string") {
    return NextResponse.json({ error: "query must be a string" }, { status: 400 });
  }

  // Warm the index if this tenant has nothing indexed for the entity.
  const stats = getIndexStats(tenantId);
  let coldStarted = false;
  let coldStartFailed = false;

  if ((stats.byEntity[entity] ?? 0) === 0) {
    const loader: RowLoader = async ({ table, columns, limit: rowLimit }) => {
      const { data, error } = await supabase
        .from(table)
        .select(columns.join(", "))
        .limit(rowLimit);
      // Returning null keeps any existing index rather than clearing it.
      if (error) return null;
      return (data ?? []) as unknown as Array<Record<string, unknown>>;
    };

    const sync = await syncEntity(entity, tenantId, loader, { limit: COLD_START_LIMIT });
    coldStarted = sync.error === undefined;
    coldStartFailed = sync.error !== undefined;
  }

  const cappedLimit = typeof limit === "number" ? Math.min(Math.max(1, limit), 50) : 10;

  try {
    const response =
      typeof field === "string" && field !== ""
        ? lookupForField(entity, field, {
            tenantId,
            userId,
            query,
            limit: cappedLimit,
            ...(fuzzy === true ? { fuzzy: true } : {}),
          })
        : lookup({
            tenantId,
            userId,
            entity,
            query,
            limit: cappedLimit,
            ...(activeOnly === true ? { activeOnly: true } : {}),
            ...(fuzzy === true ? { fuzzy: true } : {}),
          });

    return NextResponse.json({
      ...response,
      mode: "search",
      index: {
        coldStarted,
        // A failed warm-up means an empty result says nothing about the query.
        ...(coldStartFailed
          ? {
              warning:
                "The search index was empty and could not be populated, so these results are not conclusive.",
            }
          : {}),
        documents: getIndexStats(tenantId).byEntity[entity] ?? 0,
        indexedRowCap: COLD_START_LIMIT,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // lookupForField throws for a non-reference field or unknown field name.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 400 }
    );
  }
}
