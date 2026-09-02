// GET  /api/admin/knowledge — knowledge graph stats, recent enterprise memories
// POST /api/admin/knowledge — store_memory | build_job_graph | retrieve_memories
// Admin-only; tenant-scoped. Calls Supabase — all handlers are async.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  storeEnterpriseMemory, retrieveMemories,
  type MemoryCategory, type MemoryImportance,
} from "@/lib/enterprise-memory";
import {
  buildJobGraph, buildGraphSummary,
} from "@/lib/knowledge-graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: MemoryCategory[] = ["decision", "outcome", "incident", "lesson", "recommendation", "forecast"];
const VALID_IMPORTANCE: MemoryImportance[] = ["low", "normal", "high", "critical"];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return { error: "Forbidden", status: 403 as const, profile: null };
  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const category = url.searchParams.get("category") as MemoryCategory | null;
  const importance = url.searchParams.get("importance") as MemoryImportance | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
  const jobId = url.searchParams.get("jobId");

  const [memories, graphSummary, jobGraph] = await Promise.all([
    retrieveMemories(tenantId, {
      ...(category && VALID_CATEGORIES.includes(category) ? { category } : {}),
      ...(importance && VALID_IMPORTANCE.includes(importance) ? { importance } : {}),
      limit,
    }),
    buildGraphSummary(tenantId),
    jobId ? buildJobGraph(tenantId, jobId) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    memory: { entries: memories, count: memories.length },
    graph: { summary: graphSummary },
    ...(jobGraph ? { jobGraph } : {}),
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = getTenantId(auth.profile);

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Request body required" }, { status: 400 });

  const { action } = body as Record<string, unknown>;

  if (action === "store_memory") {
    const { category, summary, entityType, entityId, actorType, actorId, detail, tags, importance } = body as Record<string, unknown>;
    if (!VALID_CATEGORIES.includes(category as MemoryCategory)) {
      return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
    }
    if (typeof summary !== "string") return NextResponse.json({ error: "summary required" }, { status: 400 });
    if (importance && !VALID_IMPORTANCE.includes(importance as MemoryImportance)) {
      return NextResponse.json({ error: `importance must be one of: ${VALID_IMPORTANCE.join(", ")}` }, { status: 400 });
    }
    await storeEnterpriseMemory({
      tenantId,
      category: category as MemoryCategory,
      summary,
      entityType: typeof entityType === "string" ? entityType : undefined,
      entityId: typeof entityId === "string" ? entityId : undefined,
      actorType: typeof actorType === "string" ? actorType : "system",
      actorId: typeof actorId === "string" ? actorId : undefined,
      detail: typeof detail === "object" && detail ? detail as Record<string, unknown> : {},
      tags: Array.isArray(tags) ? tags as string[] : [],
      importance: importance as MemoryImportance | undefined,
    });
    return NextResponse.json({ action, success: true }, { status: 201 });
  }

  if (action === "retrieve_memories") {
    const { category, entityType, entityId, importance, limit: bodyLimit } = body as Record<string, unknown>;
    const memories = await retrieveMemories(tenantId, {
      ...(category && VALID_CATEGORIES.includes(category as MemoryCategory) ? { category: category as MemoryCategory } : {}),
      ...(entityType ? { entityType: entityType as string } : {}),
      ...(entityId ? { entityId: entityId as string } : {}),
      ...(importance && VALID_IMPORTANCE.includes(importance as MemoryImportance) ? { importance: importance as MemoryImportance } : {}),
      limit: typeof bodyLimit === "number" ? Math.min(bodyLimit, 100) : 20,
    });
    return NextResponse.json({ action, memories, count: memories.length, success: true });
  }

  if (action === "build_job_graph") {
    const { jobId } = body as Record<string, unknown>;
    if (typeof jobId !== "string") return NextResponse.json({ error: "jobId required" }, { status: 400 });
    const graph = await buildJobGraph(tenantId, jobId);
    return NextResponse.json({ action, graph, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'store_memory', 'retrieve_memories', or 'build_job_graph'.` }, { status: 400 });
}
