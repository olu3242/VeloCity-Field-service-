// GET  /api/admin/knowledge-graph — graph summary, entity graphs, search
// POST /api/admin/knowledge-graph — search | build_entity
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  buildGraphSummary,
  buildEntityGraph,
  buildProviderGraph,
  buildCustomerGraph,
  buildJobGraph,
  searchGraph,
  type NodeType,
} from "@/lib/knowledge-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_ENTITY_TYPES: NodeType[] = [
  "customer", "provider", "job", "franchise", "commercial_account",
  "membership", "contract", "territory", "payment", "dispute",
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
  const providerId = url.searchParams.get("providerId");
  const customerId = url.searchParams.get("customerId");
  const jobId = url.searchParams.get("jobId");

  // Single-entity graph lookup
  if (providerId) {
    const graph = await buildProviderGraph(tenantId, providerId);
    return NextResponse.json({ tenantId, graph, generatedAt: new Date().toISOString() });
  }
  if (customerId) {
    const graph = await buildCustomerGraph(tenantId, customerId);
    return NextResponse.json({ tenantId, graph, generatedAt: new Date().toISOString() });
  }
  if (jobId) {
    const graph = await buildJobGraph(tenantId, jobId);
    return NextResponse.json({ tenantId, graph, generatedAt: new Date().toISOString() });
  }

  // Default: full graph summary
  const summary = await buildGraphSummary(tenantId);
  return NextResponse.json({
    tenantId,
    summary,
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

  if (action === "search") {
    const { query, limit } = body as Record<string, unknown>;
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const searchLimit = typeof limit === "number" ? Math.min(limit, 50) : 20;
    const nodes = await searchGraph(tenantId, query, searchLimit);
    return NextResponse.json({ action: "search", query, nodes, count: nodes.length, success: true });
  }

  if (action === "build_entity") {
    const { entityType, entityId } = body as Record<string, unknown>;
    if (!VALID_ENTITY_TYPES.includes(entityType as NodeType)) {
      return NextResponse.json(
        { error: `entityType must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof entityId !== "string") {
      return NextResponse.json({ error: "entityId required" }, { status: 400 });
    }
    const graph = await buildEntityGraph(tenantId, entityType as NodeType, entityId);
    return NextResponse.json({ action: "build_entity", graph, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'search' or 'build_entity'.` },
    { status: 400 }
  );
}
