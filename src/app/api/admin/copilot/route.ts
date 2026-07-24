// GET  /api/admin/copilot — query history, active suggestions, stats
// POST /api/admin/copilot — submit a natural-language operator query
// Admin-only; session-scoped to authenticated operator.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import {
  processQuery,
  getQueryHistory,
  getQueryStats,
} from "@/lib/operator-copilot/query-engine";
import {
  generateSuggestion,
  getActiveSuggestions,
  dismissSuggestion,
} from "@/lib/operator-copilot/action-suggester";
import {
  remember,
  getOperatorMemory,
} from "@/lib/operator-copilot/copilot-memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, user: null, profile: null };
  }

  return { error: null, status: 200 as const, user, profile };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "summary";
  const operatorId = auth.user.id;

  const circuits = getAllCircuits();
  const openCircuits = circuits.filter((c) => c.state === "open").length;

  // Auto-generate a suggestion based on current platform state
  const suggestion = generateSuggestion("api-poll", {
    openCircuits,
    degradedComponents: openCircuits,
    queueDepth: 0,
    errorRate: openCircuits / Math.max(circuits.length, 1),
  });

  if (action === "history") {
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    return NextResponse.json({
      history: getQueryHistory(operatorId, limit),
      generatedAt: new Date().toISOString(),
    });
  }

  if (action === "suggestions") {
    return NextResponse.json({
      suggestions: getActiveSuggestions(),
      generatedAt: new Date().toISOString(),
    });
  }

  if (action === "memory") {
    return NextResponse.json({
      memory: getOperatorMemory(operatorId),
      generatedAt: new Date().toISOString(),
    });
  }

  // default: summary
  return NextResponse.json({
    stats: getQueryStats(),
    activeSuggestions: getActiveSuggestions(),
    latestSuggestion: suggestion,
    platformState: {
      circuits: circuits.length,
      openCircuits,
      health: openCircuits === 0 ? "healthy" : openCircuits > circuits.length * 0.3 ? "critical" : "degraded",
    },
    generatedAt: new Date().toISOString(),
  });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const operatorId = auth.user.id;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const { query, dismiss } = body as Record<string, unknown>;

  // Dismiss action
  if (typeof dismiss === "string") {
    dismissSuggestion(dismiss);
    return NextResponse.json({ dismissed: dismiss });
  }

  // Query action
  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query (string) required" }, { status: 400 });
  }

  const tenantId = auth.profile.tenant_id ?? undefined;
  const result = processQuery(query.trim(), operatorId, tenantId);

  // Persist resolution patterns to memory for future context
  if (result.confidence >= 0.7) {
    remember(operatorId, "pattern", result.intent, result.response, result.confidence);
  }

  // Persist query to enterprise_memory for cross-session recall
  try {
    getAdminClient()
      .from("enterprise_memory")
      .insert({
        tenant_id: tenantId ?? getTenantId(auth.profile),
        category: "copilot_query",
        entity_type: "operator",
        entity_id: operatorId,
        actor_type: "operator",
        actor_id: operatorId,
        summary: result.response,
        detail: {
          queryText: result.queryText,
          intent: result.intent,
          confidence: result.confidence,
          parsedEntities: result.parsedEntities,
          queryId: result.id,
        },
        tags: ["copilot", result.intent],
      })
      .then(() => {});
  } catch {
    // non-fatal
  }

  return NextResponse.json({ result });
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  dismissSuggestion(id);
  return NextResponse.json({ dismissed: id });
}
