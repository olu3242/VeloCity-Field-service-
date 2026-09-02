// GET /api/idxf/{entity}/{id}/related — related records across every declared relationship
//
// The Related Records Engine discovers which relationships exist from metadata;
// this route supplies the tenant-scoped loader that turns them into actual rows.
// Registering a relationship makes it appear here with no route changes.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getEntity, getAllEntities } from "@/lib/metadata/entity-registry";
import { getRelationshipsFrom } from "@/lib/metadata/relationship-registry";
import { getRelated, RELATED_VIEWS, type RelatedView } from "@/lib/related/related-engine";
import { loadRelated, type RepositoryClient } from "@/lib/idxf-integration/entity-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Relationships loaded per request — bounds the fan-out of database calls. */
const MAX_RELATIONSHIPS_PER_REQUEST = 12;

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
  if (!getEntity(entity)) {
    return NextResponse.json(
      { error: `Unknown entity '${entity}'`, knownEntities: getAllEntities().map((e) => e.key) },
      { status: 404 }
    );
  }

  getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const client = auth.supabase as unknown as RepositoryClient;

  const url = new URL(request.url);
  const viewParam = url.searchParams.get("view");
  if (viewParam && !RELATED_VIEWS.includes(viewParam as RelatedView)) {
    return NextResponse.json(
      { error: `view must be one of: ${RELATED_VIEWS.join(", ")}`, },
      { status: 400 }
    );
  }
  const onlyParam = url.searchParams.get("only");
  const only = onlyParam ? onlyParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const perSection = Math.min(Number(url.searchParams.get("limit") ?? 10) || 10, 50);

  let relationships = getRelationshipsFrom(entity).filter((r) => r.surfaceInWorkspace);
  if (only) {
    const allowed = new Set(only);
    const unknown = only.filter((name) => !relationships.some((r) => r.name === name));
    if (unknown.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown relationship(s): ${unknown.join(", ")}`,
          available: relationships.map((r) => r.name),
        },
        { status: 400 }
      );
    }
    relationships = relationships.filter((r) => allowed.has(r.name));
  }

  const truncated = relationships.length > MAX_RELATIONSHIPS_PER_REQUEST;
  const loadable = relationships.slice(0, MAX_RELATIONSHIPS_PER_REQUEST);

  // Load each relationship's rows up front so the engine's resolver is
  // synchronous and every failure is attributable to a named relationship.
  const rowsByRelationship: Record<string, Array<Record<string, unknown>>> = {};
  const failed: string[] = [];

  for (const relationship of loadable) {
    const loaded = await loadRelated(client, relationship.to, relationship.foreignKey, id, {
      limit: perSection,
      unmaskSensitive: isSuperAdmin,
    });
    if (!loaded.ok) {
      failed.push(relationship.name);
      continue;
    }
    rowsByRelationship[relationship.name] = loaded.data;
  }

  const result = getRelated(entity, id, {
    ...(viewParam ? { view: viewParam as RelatedView } : {}),
    limitPerSection: perSection,
    ...(only ? { only } : {}),
    resolveRows: ({ relationship }) => rowsByRelationship[relationship.name] ?? [],
  });

  return NextResponse.json({
    ...result,
    // A section whose load failed shows zero rows; without this it would be
    // indistinguishable from a section that genuinely has none.
    ...(failed.length > 0
      ? { failedRelationships: failed, note: "These sections failed to load and show as empty." }
      : {}),
    ...(truncated
      ? {
          truncated: true,
          loadedRelationships: loadable.length,
          totalRelationships: relationships.length,
          note: `Only the ${MAX_RELATIONSHIPS_PER_REQUEST} highest-weight relationships were loaded. Use ?only= to select others.`,
        }
      : {}),
    generatedAt: new Date().toISOString(),
  });
}
