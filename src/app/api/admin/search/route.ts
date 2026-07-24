// GET  /api/admin/search?q=...&entityType=...&limit=... — full-text search across operational entities
// POST /api/admin/search — index an entity or batch-index from Supabase
// Admin-only; tenant-scoped via TENANT_BOUNDARY isolation.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { search, searchAcrossTypes, type SearchQuery } from "@/lib/search/search-engine";
import { indexEntity, getIndexStats, type SearchableEntityType } from "@/lib/search/operational-indexer";
import { searchAudit, indexAuditEntry } from "@/lib/search/audit-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ENTITY_TYPES: SearchableEntityType[] = [
  "event", "workflow", "audit", "recommendation", "incident",
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
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const entityTypeParam = url.searchParams.get("entityType");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const mode = url.searchParams.get("mode") ?? "search"; // "search" | "audit" | "stats"

  if (mode === "stats") {
    return NextResponse.json({ stats: getIndexStats(), generatedAt: new Date().toISOString() });
  }

  if (mode === "audit") {
    const actor = url.searchParams.get("actor") ?? undefined;
    const action = url.searchParams.get("action") ?? undefined;
    const outcome = url.searchParams.get("outcome") ?? undefined;
    const results = searchAudit({ actor, action, tenantId, outcome, limit });
    return NextResponse.json({ results, total: results.length, generatedAt: new Date().toISOString() });
  }

  if (!q.trim()) {
    return NextResponse.json(
      { error: "q (search query) is required" },
      { status: 400 }
    );
  }

  const entityType = VALID_ENTITY_TYPES.includes(entityTypeParam as SearchableEntityType)
    ? (entityTypeParam as SearchableEntityType)
    : undefined;

  const query: SearchQuery = { query: q, tenantId, entityType, limit };
  const results = search(query);

  // Log the search to audit trail
  indexAuditEntry({
    actor: auth.profile.role ?? "admin",
    action: "search",
    resource: entityType ?? "all",
    tenantId,
    outcome: "success",
    timestamp: new Date().toISOString(),
    tags: ["search", q.slice(0, 20)],
  });

  return NextResponse.json({
    query: q,
    entityType: entityType ?? "all",
    results,
    total: results.length,
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

  const { action } = body as Record<string, unknown>;

  // Index a single entity
  if (action === "index" || action === undefined) {
    const { entityType, entityId, title, content, tags } = body as Record<string, unknown>;

    if (typeof entityId !== "string" || typeof title !== "string") {
      return NextResponse.json({ error: "entityId and title are required" }, { status: 400 });
    }

    const resolvedType = VALID_ENTITY_TYPES.includes(entityType as SearchableEntityType)
      ? (entityType as SearchableEntityType)
      : "event" as SearchableEntityType;

    const entry = indexEntity({
      entityType: resolvedType,
      entityId,
      tenantId,
      title,
      content: typeof content === "string" ? content : title,
      tags: Array.isArray(tags) ? (tags as string[]) : [],
    });

    return NextResponse.json({ indexed: entry });
  }

  // Batch-index from Supabase system_events
  if (action === "sync-events") {
    const supabase = getAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await supabase
      .from("system_events")
      .select("id, event_type, payload, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    let indexed = 0;
    for (const ev of events ?? []) {
      const payload = (ev.payload as Record<string, unknown>) ?? {};
      indexEntity({
        entityType: "event",
        entityId: (ev.id as string),
        tenantId,
        title: ev.event_type as string,
        content: [
          ev.event_type,
          payload.workstream ?? "",
          payload.workflow ?? "",
          payload.intent ?? "",
        ].join(" "),
        tags: [ev.event_type as string],
      });
      indexed++;
    }

    return NextResponse.json({ action: "sync-events", indexed, generatedAt: new Date().toISOString() });
  }

  // Index enterprise_memory entries
  if (action === "sync-memory") {
    const supabase = getAdminClient();
    const { data: entries } = await supabase
      .from("enterprise_memory")
      .select("id, category, summary, detail, tags, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    let indexed = 0;
    for (const entry of entries ?? []) {
      indexEntity({
        entityType: "recommendation",
        entityId: entry.id as string,
        tenantId,
        title: `[${entry.category}] ${(entry.summary as string).slice(0, 80)}`,
        content: entry.summary as string,
        tags: Array.isArray(entry.tags) ? (entry.tags as string[]) : [],
      });
      indexed++;
    }

    return NextResponse.json({ action: "sync-memory", indexed, generatedAt: new Date().toISOString() });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
