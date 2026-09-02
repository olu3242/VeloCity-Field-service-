// GET  /api/admin/ecosystem — cognitive ecosystem: digital twin, entity graph, fabric health
// POST /api/admin/ecosystem — sync_twin | register_service | record_fabric_read | record_fabric_write | propose_evolution | advance_evolution
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { syncDigitalTwin, getLatestTwinState, getTwinHistory } from "@/lib/digital-twin";
import {
  registerFabricService, pulseService, recordFabricRead, recordFabricWrite, recordFabricError,
  getFabricHealth, getFabricStats, getFabricInteractions, type ServiceType,
} from "@/lib/ecaos/intelligence-fabric";
import {
  proposeEvolution, advanceEvolutionStatus, getEvolutionBacklog, getShippedEvolutions, getEvolutionStats,
  type EvolutionCategory, type EvolutionStatus,
} from "@/lib/ecaos/self-evolution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_SERVICE_TYPES: ServiceType[] = [
  "memory", "knowledge_graph", "digital_twin", "embeddings",
  "vector_search", "decision_history", "telemetry", "financial_ledger",
  "audit_ledger", "event_bus", "workflow_state", "ai_context", "policy_engine",
];
const VALID_EVOLUTION_STATUSES: EvolutionStatus[] = [
  "proposed", "governance_review", "approved", "implementing", "shipped", "rejected",
];
const VALID_EVOLUTION_CATEGORIES: EvolutionCategory[] = [
  "bottleneck_removal", "automation_opportunity", "architectural_refactor",
  "new_ai_agent", "dispatch_improvement", "pricing_optimization",
  "prompt_refinement", "backlog_generation",
];
const VALID_EFFORT = ["low", "medium", "high"];

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
  const twinHistoryLimit = Math.min(parseInt(url.searchParams.get("twinHistory") ?? "24", 10), 100);

  const [latestTwin, twinHistory] = await Promise.all([
    getLatestTwinState(),
    getTwinHistory(twinHistoryLimit),
  ]);

  return NextResponse.json({
    digitalTwin: { latest: latestTwin, history: twinHistory },
    fabric: {
      health: getFabricHealth(),
      stats: getFabricStats(),
      recentInteractions: getFabricInteractions(30),
    },
    evolution: {
      backlog: getEvolutionBacklog(20),
      shipped: getShippedEvolutions(10),
      stats: getEvolutionStats(),
    },
    tenantId,
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

  if (action === "sync_twin") {
    const twin = await syncDigitalTwin(tenantId);
    return NextResponse.json({ action, twin, success: true }, { status: 201 });
  }

  if (action === "register_service") {
    const { name, serviceType } = body as Record<string, unknown>;
    if (typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!VALID_SERVICE_TYPES.includes(serviceType as ServiceType)) {
      return NextResponse.json({ error: `serviceType must be one of: ${VALID_SERVICE_TYPES.join(", ")}` }, { status: 400 });
    }
    const svc = registerFabricService(name, serviceType as ServiceType);
    return NextResponse.json({ action, svc, success: true }, { status: 201 });
  }

  if (action === "pulse_service") {
    const { name } = body as Record<string, unknown>;
    if (typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
    pulseService(name);
    return NextResponse.json({ action, name, success: true });
  }

  if (action === "record_fabric_read") {
    const { fromService, toService } = body as Record<string, unknown>;
    if (typeof fromService !== "string" || typeof toService !== "string") {
      return NextResponse.json({ error: "fromService and toService required" }, { status: 400 });
    }
    recordFabricRead(fromService, toService);
    return NextResponse.json({ action, fromService, toService, success: true });
  }

  if (action === "record_fabric_write") {
    const { fromService, toService } = body as Record<string, unknown>;
    if (typeof fromService !== "string" || typeof toService !== "string") {
      return NextResponse.json({ error: "fromService and toService required" }, { status: 400 });
    }
    recordFabricWrite(fromService, toService);
    return NextResponse.json({ action, fromService, toService, success: true });
  }

  if (action === "record_fabric_error") {
    const { serviceName } = body as Record<string, unknown>;
    if (typeof serviceName !== "string") return NextResponse.json({ error: "serviceName required" }, { status: 400 });
    recordFabricError(serviceName);
    return NextResponse.json({ action, serviceName, success: true });
  }

  if (action === "propose_evolution") {
    const { category, title, rationale, estimatedImpactPct, effortLevel, targetDomain, detectedFrom } = body as Record<string, unknown>;
    if (!VALID_EVOLUTION_CATEGORIES.includes(category as EvolutionCategory)) {
      return NextResponse.json({ error: `category must be one of: ${VALID_EVOLUTION_CATEGORIES.join(", ")}` }, { status: 400 });
    }
    if (typeof title !== "string" || typeof rationale !== "string" || typeof targetDomain !== "string") {
      return NextResponse.json({ error: "title, rationale, and targetDomain required" }, { status: 400 });
    }
    if (!VALID_EFFORT.includes(effortLevel as string)) {
      return NextResponse.json({ error: "effortLevel must be low, medium, or high" }, { status: 400 });
    }
    const rec = proposeEvolution({
      category: category as EvolutionCategory,
      title,
      rationale,
      estimatedImpactPct: typeof estimatedImpactPct === "number" ? estimatedImpactPct : 0,
      effortLevel: effortLevel as "low" | "medium" | "high",
      targetDomain,
      detectedFrom: typeof detectedFrom === "string" ? detectedFrom : "ecosystem-admin",
    });
    return NextResponse.json({ action, rec, success: true }, { status: 201 });
  }

  if (action === "advance_evolution") {
    const { id, status } = body as Record<string, unknown>;
    if (typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });
    if (!VALID_EVOLUTION_STATUSES.includes(status as EvolutionStatus)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_EVOLUTION_STATUSES.join(", ")}` }, { status: 400 });
    }
    const rec = advanceEvolutionStatus(id, status as EvolutionStatus);
    if (!rec) return NextResponse.json({ error: `Evolution '${id}' not found` }, { status: 404 });
    return NextResponse.json({ action, rec, success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'sync_twin', 'register_service', 'pulse_service', 'record_fabric_read', 'record_fabric_write', 'record_fabric_error', 'propose_evolution', or 'advance_evolution'.` }, { status: 400 });
}
