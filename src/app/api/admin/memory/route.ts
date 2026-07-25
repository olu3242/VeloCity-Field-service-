// GET  /api/admin/memory — retrieve enterprise memories, stats, search
// POST /api/admin/memory — store | search
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  retrieveMemories,
  storeEnterpriseMemory,
  findSimilarCases,
  getMemoryStats,
  type MemoryCategory,
  type MemoryImportance,
  type StoreMemoryInput,
} from "@/lib/enterprise-memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CATEGORIES: MemoryCategory[] = [
  "decision", "outcome", "incident", "lesson", "recommendation", "forecast",
];
const VALID_IMPORTANCES: MemoryImportance[] = ["low", "normal", "high", "critical"];

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
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category") as MemoryCategory | null;
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const importance = url.searchParams.get("importance") as MemoryImportance | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  if (q) {
    const results = await findSimilarCases(tenantId, q, limit);
    return NextResponse.json({ tenantId, query: q, results, count: results.length, generatedAt: new Date().toISOString() });
  }

  const [memories, stats] = await Promise.all([
    retrieveMemories(tenantId, {
      ...(category && VALID_CATEGORIES.includes(category) ? { category } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(importance && VALID_IMPORTANCES.includes(importance) ? { importance } : {}),
      limit,
    }),
    getMemoryStats(tenantId),
  ]);

  return NextResponse.json({
    tenantId,
    memories,
    stats,
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

  if (action === "store") {
    const { category, entityType, entityId, actorType, actorId, summary, detail, tags, importance } =
      body as Record<string, unknown>;

    if (!VALID_CATEGORIES.includes(category as MemoryCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof summary !== "string" || !summary.trim()) {
      return NextResponse.json({ error: "summary required" }, { status: 400 });
    }

    const input: StoreMemoryInput = {
      tenantId,
      category: category as MemoryCategory,
      entityType: typeof entityType === "string" ? entityType : undefined,
      entityId: typeof entityId === "string" ? entityId : undefined,
      actorType: typeof actorType === "string" ? actorType : "admin",
      actorId: typeof actorId === "string" ? actorId : undefined,
      summary,
      detail: (detail && typeof detail === "object") ? (detail as Record<string, unknown>) : {},
      tags: Array.isArray(tags) ? (tags as string[]) : [],
      importance: VALID_IMPORTANCES.includes(importance as MemoryImportance)
        ? (importance as MemoryImportance) : "normal",
    };

    await storeEnterpriseMemory(input);
    return NextResponse.json({ action: "store", success: true }, { status: 201 });
  }

  if (action === "search") {
    const { query, limit } = body as Record<string, unknown>;
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    const searchLimit = typeof limit === "number" ? Math.min(limit, 100) : 20;
    const results = await findSimilarCases(tenantId, query, searchLimit);
    return NextResponse.json({ action: "search", query, results, count: results.length, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'store' or 'search'.` },
    { status: 400 }
  );
}
