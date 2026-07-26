// GET  /api/admin/ecaos — unified ECAOS OS dashboard: lifecycle, fabric, certification, evolution
// POST /api/admin/ecaos — begin_workstream | advance_stage | emit_event | abort | certify | propose_evolution
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { RUNTIME_EVENTS, WORKSTREAM_DOMAINS, type RuntimeEvent, type WorkstreamDomain } from "@/lib/ecaos/runtime-contract";
import { beginWorkstream, advanceStage, emitEvent, abortWorkstream, getActiveWorkstreams, getWorkstreamHistory, getLifecycleSummary } from "@/lib/ecaos/lifecycle-runner";
import { certifyWorkstream, getCertificationSummary, getFailedCertifications } from "@/lib/ecaos/certification-framework";
import { getFabricHealth, getFabricStats, getFabricInteractions } from "@/lib/ecaos/intelligence-fabric";
import { proposeEvolution, getEvolutionBacklog, getShippedEvolutions, getEvolutionStats, type EvolutionCategory } from "@/lib/ecaos/self-evolution";
import { getCouncilSummary } from "@/lib/agent-council/council-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DOMAINS = WORKSTREAM_DOMAINS as unknown as string[];
const VALID_EVENTS = new Set<string>(RUNTIME_EVENTS);
const VALID_EFFORT = ["low", "medium", "high"];
const VALID_EVOLUTION_CATEGORIES: EvolutionCategory[] = [
  "bottleneck_removal", "automation_opportunity", "architectural_refactor",
  "new_ai_agent", "dispatch_improvement", "pricing_optimization",
  "prompt_refinement", "backlog_generation",
];

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
  const workstreamId = url.searchParams.get("workstreamId");
  const historyLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  return NextResponse.json({
    os: {
      lifecycle: getLifecycleSummary(),
      activeWorkstreams: getActiveWorkstreams(tenantId),
      history: getWorkstreamHistory(historyLimit, tenantId),
      ...(workstreamId ? { certification: certifyWorkstream(workstreamId, tenantId) } : {}),
    },
    certification: {
      summary: getCertificationSummary(),
      failed: getFailedCertifications().slice(0, 10),
    },
    fabric: {
      health: getFabricHealth(),
      stats: getFabricStats(),
      recentInteractions: getFabricInteractions(20),
    },
    council: getCouncilSummary(),
    evolution: {
      backlog: getEvolutionBacklog(10),
      shipped: getShippedEvolutions(5),
      stats: getEvolutionStats(),
    },
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

  if (action === "begin_workstream") {
    const { domain, name, initiatedBy, metadata } = body as Record<string, unknown>;
    if (!VALID_DOMAINS.includes(domain as string)) {
      return NextResponse.json({ error: `domain must be one of: ${VALID_DOMAINS.join(", ")}` }, { status: 400 });
    }
    if (typeof name !== "string" || typeof initiatedBy !== "string") {
      return NextResponse.json({ error: "name and initiatedBy required" }, { status: 400 });
    }
    const run = beginWorkstream({ domain: domain as WorkstreamDomain, name, tenantId, initiatedBy, metadata: typeof metadata === "object" && metadata ? metadata as Record<string, unknown> : undefined });
    return NextResponse.json({ action, run, success: true }, { status: 201 });
  }

  if (action === "advance_stage") {
    const { workstreamId, extraEvent } = body as Record<string, unknown>;
    if (typeof workstreamId !== "string") return NextResponse.json({ error: "workstreamId required" }, { status: 400 });
    if (extraEvent && !VALID_EVENTS.has(extraEvent as string)) {
      return NextResponse.json({ error: `extraEvent must be a valid RuntimeEvent` }, { status: 400 });
    }
    const run = advanceStage(workstreamId, extraEvent as RuntimeEvent | undefined);
    if (!run) return NextResponse.json({ error: `Workstream '${workstreamId}' not found or not running` }, { status: 404 });
    return NextResponse.json({ action, run, success: true });
  }

  if (action === "emit_event") {
    const { workstreamId, event } = body as Record<string, unknown>;
    if (typeof workstreamId !== "string") return NextResponse.json({ error: "workstreamId required" }, { status: 400 });
    if (!VALID_EVENTS.has(event as string)) {
      return NextResponse.json({ error: `event must be a valid RuntimeEvent: ${Array.from(VALID_EVENTS).join(", ")}` }, { status: 400 });
    }
    const run = emitEvent(workstreamId, event as RuntimeEvent);
    if (!run) return NextResponse.json({ error: `Workstream '${workstreamId}' not found or not running` }, { status: 404 });
    return NextResponse.json({ action, run, success: true });
  }

  if (action === "abort") {
    const { workstreamId, reason } = body as Record<string, unknown>;
    if (typeof workstreamId !== "string") return NextResponse.json({ error: "workstreamId required" }, { status: 400 });
    abortWorkstream(workstreamId, typeof reason === "string" ? reason : "admin-aborted");
    return NextResponse.json({ action, workstreamId, success: true });
  }

  if (action === "certify") {
    const { workstreamId } = body as Record<string, unknown>;
    if (typeof workstreamId !== "string") return NextResponse.json({ error: "workstreamId required" }, { status: 400 });
    const cert = certifyWorkstream(workstreamId, tenantId);
    return NextResponse.json({ action, cert, success: true }, { status: 201 });
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
      return NextResponse.json({ error: `effortLevel must be low, medium, or high` }, { status: 400 });
    }
    const rec = proposeEvolution({
      category: category as EvolutionCategory,
      title,
      rationale,
      estimatedImpactPct: typeof estimatedImpactPct === "number" ? estimatedImpactPct : 0,
      effortLevel: effortLevel as "low" | "medium" | "high",
      targetDomain,
      detectedFrom: typeof detectedFrom === "string" ? detectedFrom : "admin",
    });
    return NextResponse.json({ action, rec, success: true }, { status: 201 });
  }

  return NextResponse.json({ error: `Unknown action: ${action}. Use 'begin_workstream', 'advance_stage', 'emit_event', 'abort', 'certify', or 'propose_evolution'.` }, { status: 400 });
}
