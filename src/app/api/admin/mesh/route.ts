// GET  /api/admin/mesh — shared contexts, execution memory summary, knowledge graph, search index stats
// POST /api/admin/mesh — share_context | get_context | query_contexts | expire_contexts
//                        | record_memory | recall_memory | find_similar_resolutions
//                        | add_node | add_edge | find_related | index_entity | search | remove_from_index
// Admin-only. Contexts and search are tenant-scoped — tenantId is always taken from the caller's
// profile, never the request body, so one tenant cannot read or write another's mesh data.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  shareContext,
  getContext,
  queryContexts,
  expireContexts,
  CONTEXT_TTL_MS,
} from "@/lib/mesh/context-engine";
import {
  recordMemory,
  recallMemory,
  findSimilarResolutions,
  getMemorySummary,
  type ExecutionMemory,
  type MemoryType,
} from "@/lib/mesh/execution-memory";
import {
  GLOBAL_MESH,
  type MeshNodeType,
} from "@/lib/mesh/knowledge-graph";
import {
  indexEntity,
  search,
  removeFromIndex,
  getIndexStats,
  type SearchableEntityType,
} from "@/lib/mesh/semantic-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_MEMORY_TYPES: MemoryType[] = [
  "intervention", "failure", "recovery", "optimization", "resolution", "pattern",
];
const VALID_OUTCOMES: ExecutionMemory["outcome"][] = ["successful", "partial", "failed"];
const VALID_NODE_TYPES: MeshNodeType[] = [
  "entity", "workflow", "escalation", "anomaly", "decision", "operator", "integration", "outcome",
];
const VALID_ENTITY_TYPES: SearchableEntityType[] = [
  "dispute", "event", "escalation", "failure", "workflow", "recommendation", "anomaly", "log",
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
  const domain = url.searchParams.get("domain");
  const entityId = url.searchParams.get("entityId");
  const nodeId = url.searchParams.get("nodeId");
  const minWeight = parseFloat(url.searchParams.get("minWeight") ?? "0.7");

  return NextResponse.json({
    contexts: {
      ...(domain ? { matching: queryContexts(tenantId, domain, entityId ?? undefined) } : {}),
      ttlMs: CONTEXT_TTL_MS,
    },
    memory: {
      summary: getMemorySummary(),
      supportedTypes: VALID_MEMORY_TYPES,
    },
    graph: {
      summary: GLOBAL_MESH.toSummary(),
      highWeightNodes: GLOBAL_MESH.getHighWeightNodes(
        Number.isNaN(minWeight) ? 0.7 : minWeight
      ),
      ...(nodeId
        ? {
            related: GLOBAL_MESH.findRelated(nodeId),
            influenceScore: GLOBAL_MESH.getInfluenceScore(nodeId),
          }
        : {}),
    },
    searchIndex: {
      stats: getIndexStats(),
      supportedTypes: VALID_ENTITY_TYPES,
    },
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

  // ── Context engine ──────────────────────────────────────────────────────

  if (action === "share_context") {
    const { domain, entityId, data, accessibleBy, ttlMs } = body as Record<string, unknown>;
    if (typeof domain !== "string" || domain.trim() === "") {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }
    if (typeof entityId !== "string" || entityId.trim() === "") {
      return NextResponse.json({ error: "entityId required" }, { status: 400 });
    }
    if (!Array.isArray(accessibleBy) || accessibleBy.length === 0) {
      return NextResponse.json(
        { error: "accessibleBy must be a non-empty array of agent names (or ['*'])" },
        { status: 400 }
      );
    }
    const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : CONTEXT_TTL_MS;
    const context = shareContext({
      tenantId,
      domain,
      entityId,
      data: data && typeof data === "object" ? (data as Record<string, unknown>) : {},
      accessibleBy: accessibleBy as string[],
      expiresAt: new Date(Date.now() + ttl).toISOString(),
    });
    return NextResponse.json({ action: "share_context", context, success: true }, { status: 201 });
  }

  if (action === "get_context") {
    const { contextId, requestingAgent } = body as Record<string, unknown>;
    if (typeof contextId !== "string" || typeof requestingAgent !== "string") {
      return NextResponse.json(
        { error: "contextId and requestingAgent required" },
        { status: 400 }
      );
    }
    const context = getContext(contextId, requestingAgent, tenantId);
    if (!context) {
      // getContext returns null for missing, expired, wrong-tenant, and unauthorised
      // alike — deliberately not distinguished, so this cannot be used to probe
      // for the existence of another tenant's contexts.
      return NextResponse.json(
        { error: "Context not found, expired, or not accessible by this agent" },
        { status: 404 }
      );
    }
    return NextResponse.json({ action: "get_context", context, success: true });
  }

  if (action === "query_contexts") {
    const { domain, entityId } = body as Record<string, unknown>;
    if (typeof domain !== "string" || domain.trim() === "") {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }
    const contexts = queryContexts(
      tenantId,
      domain,
      typeof entityId === "string" ? entityId : undefined
    );
    return NextResponse.json({ action: "query_contexts", contexts, success: true });
  }

  if (action === "expire_contexts") {
    const removed = expireContexts();
    return NextResponse.json({ action: "expire_contexts", removed, success: true });
  }

  // ── Execution memory ────────────────────────────────────────────────────

  if (action === "record_memory") {
    const { type, domain, summary, detail, outcome, confidence } =
      body as Record<string, unknown>;
    if (!VALID_MEMORY_TYPES.includes(type as MemoryType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_MEMORY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof domain !== "string" || domain.trim() === "") {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }
    if (typeof summary !== "string" || summary.trim() === "") {
      return NextResponse.json({ error: "summary required" }, { status: 400 });
    }
    if (!VALID_OUTCOMES.includes(outcome as ExecutionMemory["outcome"])) {
      return NextResponse.json(
        { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    if (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
      return NextResponse.json({ error: "confidence must be between 0 and 1" }, { status: 400 });
    }
    const memory = recordMemory({
      type: type as MemoryType,
      domain,
      summary,
      detail: detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {},
      outcome: outcome as ExecutionMemory["outcome"],
      confidence: typeof confidence === "number" ? confidence : 0.5,
    });
    return NextResponse.json({ action: "record_memory", memory, success: true }, { status: 201 });
  }

  if (action === "recall_memory") {
    const { domain, type, minConfidence } = body as Record<string, unknown>;
    if (typeof domain !== "string" || domain.trim() === "") {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }
    if (type !== undefined && !VALID_MEMORY_TYPES.includes(type as MemoryType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_MEMORY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const memories = recallMemory(
      domain,
      type as MemoryType | undefined,
      typeof minConfidence === "number" ? minConfidence : undefined
    );
    return NextResponse.json({ action: "recall_memory", memories, success: true });
  }

  if (action === "find_similar_resolutions") {
    const { domain, outcome } = body as Record<string, unknown>;
    if (typeof domain !== "string" || domain.trim() === "") {
      return NextResponse.json({ error: "domain required" }, { status: 400 });
    }
    if (!VALID_OUTCOMES.includes(outcome as ExecutionMemory["outcome"])) {
      return NextResponse.json(
        { error: `outcome must be one of: ${VALID_OUTCOMES.join(", ")}` },
        { status: 400 }
      );
    }
    const memories = findSimilarResolutions(domain, outcome as ExecutionMemory["outcome"]);
    return NextResponse.json({ action: "find_similar_resolutions", memories, success: true });
  }

  // ── Knowledge graph ─────────────────────────────────────────────────────

  if (action === "add_node") {
    const { id, type, label, domain, weight, attributes } = body as Record<string, unknown>;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_NODE_TYPES.includes(type as MeshNodeType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_NODE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof label !== "string" || typeof domain !== "string") {
      return NextResponse.json({ error: "label and domain required" }, { status: 400 });
    }
    if (weight !== undefined && (typeof weight !== "number" || weight < 0 || weight > 1)) {
      return NextResponse.json({ error: "weight must be between 0 and 1" }, { status: 400 });
    }
    const node = GLOBAL_MESH.addNode({
      id,
      type: type as MeshNodeType,
      label,
      domain,
      weight: typeof weight === "number" ? weight : 0.5,
      attributes:
        attributes && typeof attributes === "object"
          ? (attributes as Record<string, unknown>)
          : {},
    });
    return NextResponse.json({ action: "add_node", node, success: true }, { status: 201 });
  }

  if (action === "add_edge") {
    const { from, to, relationship, strength, metadata } = body as Record<string, unknown>;
    if (typeof from !== "string" || typeof to !== "string") {
      return NextResponse.json({ error: "from and to required" }, { status: 400 });
    }
    if (typeof relationship !== "string" || relationship.trim() === "") {
      return NextResponse.json({ error: "relationship required" }, { status: 400 });
    }
    // Reject dangling edges so the graph stays traversable.
    const missing = [from, to].filter((n) => !GLOBAL_MESH.nodes.has(n));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown node(s): ${missing.join(", ")}` },
        { status: 400 }
      );
    }
    const edge = GLOBAL_MESH.addEdge({
      from,
      to,
      relationship,
      strength: typeof strength === "number" ? strength : 0.5,
      metadata:
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "add_edge", edge, success: true }, { status: 201 });
  }

  if (action === "find_related") {
    const { nodeId, relationship } = body as Record<string, unknown>;
    if (typeof nodeId !== "string") {
      return NextResponse.json({ error: "nodeId required" }, { status: 400 });
    }
    if (!GLOBAL_MESH.nodes.has(nodeId)) {
      return NextResponse.json({ error: `Unknown nodeId: ${nodeId}` }, { status: 404 });
    }
    return NextResponse.json({
      action: "find_related",
      related: GLOBAL_MESH.findRelated(
        nodeId,
        typeof relationship === "string" ? relationship : undefined
      ),
      influenceScore: GLOBAL_MESH.getInfluenceScore(nodeId),
      success: true,
    });
  }

  // ── Semantic search ─────────────────────────────────────────────────────

  if (action === "index_entity") {
    const { id, type, title, content, tags, metadata } = body as Record<string, unknown>;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (!VALID_ENTITY_TYPES.includes(type as SearchableEntityType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof title !== "string" || typeof content !== "string") {
      return NextResponse.json({ error: "title and content required" }, { status: 400 });
    }
    indexEntity({
      id,
      type: type as SearchableEntityType,
      tenantId,
      title,
      content,
      tags: Array.isArray(tags) ? (tags as string[]) : [],
      metadata:
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {},
    });
    return NextResponse.json({ action: "index_entity", id, success: true }, { status: 201 });
  }

  if (action === "search") {
    const { query, type, limit } = body as Record<string, unknown>;
    if (typeof query !== "string" || query.trim() === "") {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    if (type !== undefined && !VALID_ENTITY_TYPES.includes(type as SearchableEntityType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_ENTITY_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const results = search(query, {
      // Always tenant-pinned — a caller cannot search another tenant's index.
      tenantId,
      ...(type ? { type: type as SearchableEntityType } : {}),
      ...(typeof limit === "number" ? { limit: Math.min(limit, 100) } : {}),
    });
    return NextResponse.json({ action: "search", results, success: true });
  }

  if (action === "remove_from_index") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    // The search index exposes no lookup-by-id, so a tenant-ownership check is not
    // possible here without reaching into its private store. Rather than ship a
    // guard that cannot actually verify ownership, deletion is restricted to
    // super_admin — a tenant admin must not be able to evict another tenant's entry.
    if (auth.profile.role !== "super_admin") {
      return NextResponse.json(
        {
          error:
            "Forbidden — index deletion requires super_admin because per-entity tenant ownership cannot be verified",
        },
        { status: 403 }
      );
    }
    removeFromIndex(id);
    return NextResponse.json({
      action: "remove_from_index",
      id,
      stats: getIndexStats(),
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'share_context', 'get_context', 'query_contexts', 'expire_contexts', 'record_memory', 'recall_memory', 'find_similar_resolutions', 'add_node', 'add_edge', 'find_related', 'index_entity', 'search', or 'remove_from_index'.`,
    },
    { status: 400 }
  );
}
