// GET /api/idxf/{entity}/{id}/workspace — the Universal Data Workspace for any record
//
// Assembles the full workspace payload: overview, layout, related sections,
// knowledge graph, health, versions, permissions and the entity's API surface —
// all from metadata, for every registered entity, with no per-entity code.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getEntity, getAllEntities } from "@/lib/metadata/entity-registry";
import { getEntityFields } from "@/lib/metadata/field-engine";
import { getRelationshipsFrom } from "@/lib/metadata/relationship-registry";
import { buildWorkspace } from "@/lib/workspace/workspace-engine";
import { BREAKPOINTS, type Breakpoint } from "@/lib/forms/layout-engine";
import {
  readEntity,
  loadRelated,
  type RepositoryClient,
} from "@/lib/idxf-integration/entity-repository";
import { registerSelection } from "@/lib/lookup/lookup-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RELATIONSHIPS = 10;

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error || !auth.profile || !auth.supabase || !auth.userId) {
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

  const tenantId = getTenantId(auth.profile);
  const isSuperAdmin = auth.profile.role === "super_admin";
  const client = auth.supabase as unknown as RepositoryClient;

  const url = new URL(request.url);
  const breakpointParam = url.searchParams.get("breakpoint");
  if (breakpointParam && !BREAKPOINTS.includes(breakpointParam as Breakpoint)) {
    return NextResponse.json(
      { error: `breakpoint must be one of: ${BREAKPOINTS.join(", ")}` },
      { status: 400 }
    );
  }

  // Read the record first — a workspace for a row the caller cannot see must
  // 404 rather than render an empty shell that confirms the id exists.
  const read = await readEntity(client, entity, id, {
    computeDerived: false,
    unmaskSensitive: isSuperAdmin,
  });

  if (!read.ok) {
    const status = read.error.code === "not_found" ? 404 : 500;
    return NextResponse.json({ error: read.error.message, code: read.error.code }, { status });
  }

  // Load related rows for the highest-weight relationships.
  const relationships = getRelationshipsFrom(entity)
    .filter((r) => r.surfaceInWorkspace)
    .slice(0, MAX_RELATIONSHIPS);

  const rowsByRelationship: Record<string, Array<Record<string, unknown>>> = {};
  const failedRelationships: string[] = [];

  for (const relationship of relationships) {
    const loaded = await loadRelated(client, relationship.to, relationship.foreignKey, id, {
      limit: 10,
      unmaskSensitive: isSuperAdmin,
    });
    if (!loaded.ok) {
      failedRelationships.push(relationship.name);
      continue;
    }
    rowsByRelationship[relationship.name] = loaded.data;
  }

  // Non-super-admins never see sensitive fields, so those are excluded from the
  // layout entirely rather than rendered as masked inputs the user cannot use.
  const visibleFields = isSuperAdmin
    ? undefined
    : getEntityFields(entity).filter((f) => !f.sensitive).map((f) => f.name);

  const workspace = buildWorkspace(entity, read.data.row, {
    ...(breakpointParam ? { breakpoint: breakpointParam as Breakpoint } : {}),
    ...(visibleFields ? { visibleFields } : {}),
    includeValidation: url.searchParams.get("validate") === "true",
    ...(url.searchParams.get("quality") === "true" ? { qualityOptions: {} } : {}),
    relatedOptions: {
      limitPerSection: 10,
      resolveRows: ({ relationship }) => rowsByRelationship[relationship.name] ?? [],
    },
  });

  // Opening a record is a recency signal that improves future lookup ranking.
  registerSelection(tenantId, auth.userId, entity, id, workspace.title);

  return NextResponse.json({
    workspace,
    ...(failedRelationships.length > 0
      ? {
          failedRelationships,
          note: "These related sections failed to load and appear empty rather than absent.",
        }
      : {}),
    generatedAt: new Date().toISOString(),
  });
}
