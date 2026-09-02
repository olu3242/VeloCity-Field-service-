// GET  /api/admin/autonomous-optimization — opportunities, cost summary, workflow optimizations
// POST /api/admin/autonomous-optimization — identify_opportunity | approve | complete | dismiss | identify_cost_waste | apply_cost_optimization | analyze_workflow
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  identifyOpportunity,
  approveOptimization,
  completeOptimization,
  dismissOptimization,
  getOpportunitiesByDomain,
  getTopOpportunities,
  type OptimizationOpportunity,
} from "@/lib/autonomous-optimization/optimization-engine";
import {
  identifyCostWaste,
  applyOptimization as applyCostOptimization,
  getCostOptimizationSummary,
} from "@/lib/autonomous-optimization/cost-optimizer";
import {
  analyzeWorkflow,
  applyOptimization as applyWorkflowOptimization,
} from "@/lib/autonomous-optimization/workflow-optimizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_DOMAINS: OptimizationOpportunity["domain"][] = [
  "workflow", "cost", "latency", "resilience", "queue",
];
const VALID_EFFORT_LEVELS: OptimizationOpportunity["effortLevel"][] = ["low", "medium", "high"];

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

  getTenantId(auth.profile);
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") as OptimizationOpportunity["domain"] | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10", 10), 100);

  const topOpportunities = getTopOpportunities(limit);
  const costSummary = getCostOptimizationSummary();

  return NextResponse.json({
    opportunities: {
      top: topOpportunities,
      ...(domain && VALID_DOMAINS.includes(domain)
        ? { byDomain: getOpportunitiesByDomain(domain) }
        : {}),
    },
    cost: costSummary,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
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

  if (action === "identify_opportunity") {
    const { domain, title, description, estimatedGainPct, effortLevel } =
      body as Record<string, unknown>;

    if (!VALID_DOMAINS.includes(domain as OptimizationOpportunity["domain"])) {
      return NextResponse.json(
        { error: `domain must be one of: ${VALID_DOMAINS.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof title !== "string" || typeof description !== "string") {
      return NextResponse.json({ error: "title and description required" }, { status: 400 });
    }
    if (!VALID_EFFORT_LEVELS.includes(effortLevel as OptimizationOpportunity["effortLevel"])) {
      return NextResponse.json(
        { error: `effortLevel must be one of: ${VALID_EFFORT_LEVELS.join(", ")}` },
        { status: 400 }
      );
    }

    const opportunity = identifyOpportunity(
      domain as OptimizationOpportunity["domain"],
      title,
      description,
      typeof estimatedGainPct === "number" ? estimatedGainPct : 0,
      effortLevel as OptimizationOpportunity["effortLevel"]
    );
    return NextResponse.json({ action: "identify_opportunity", opportunity, success: true }, { status: 201 });
  }

  if (action === "approve") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    approveOptimization(id);
    return NextResponse.json({ action: "approve", id, success: true });
  }

  if (action === "complete") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    completeOptimization(id);
    return NextResponse.json({ action: "complete", id, success: true });
  }

  if (action === "dismiss") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    dismissOptimization(id);
    return NextResponse.json({ action: "dismiss", id, success: true });
  }

  if (action === "identify_cost_waste") {
    const { category, wasteUsd, technique } = body as Record<string, unknown>;

    const VALID_CATEGORIES = ["ai_calls", "queue_overhead", "retry_waste", "idle_workers"];
    if (!VALID_CATEGORIES.includes(category as string)) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (typeof wasteUsd !== "number") {
      return NextResponse.json({ error: "wasteUsd required" }, { status: 400 });
    }

    const record = identifyCostWaste(
      category as "ai_calls" | "queue_overhead" | "retry_waste" | "idle_workers",
      wasteUsd,
      typeof technique === "string" ? technique : "",
      auth.profile.tenant_id ?? undefined
    );
    return NextResponse.json({ action: "identify_cost_waste", record, success: true }, { status: 201 });
  }

  if (action === "apply_cost_optimization") {
    const { id } = body as Record<string, unknown>;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    applyCostOptimization(id);
    return NextResponse.json({ action: "apply_cost_optimization", id, success: true });
  }

  if (action === "analyze_workflow") {
    const { workflowType, stepTimings } = body as Record<string, unknown>;
    if (typeof workflowType !== "string") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }
    if (!Array.isArray(stepTimings)) {
      return NextResponse.json({ error: "stepTimings array required" }, { status: 400 });
    }
    const result = analyzeWorkflow(workflowType, stepTimings as number[]);
    return NextResponse.json({ action: "analyze_workflow", result, success: true });
  }

  if (action === "apply_workflow_optimization") {
    const { workflowType } = body as Record<string, unknown>;
    if (typeof workflowType !== "string") {
      return NextResponse.json({ error: "workflowType required" }, { status: 400 });
    }
    applyWorkflowOptimization(workflowType);
    return NextResponse.json({ action: "apply_workflow_optimization", workflowType, success: true });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'identify_opportunity', 'approve', 'complete', 'dismiss', 'identify_cost_waste', 'apply_cost_optimization', 'analyze_workflow', or 'apply_workflow_optimization'.`,
    },
    { status: 400 }
  );
}
