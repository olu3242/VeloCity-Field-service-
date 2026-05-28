import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { createMetaOrchestrationPlan, executeMetaOrchestrationPlan } from "@/runtime/orchestration/meta-orchestrator";
import { getMemoryGraph, linkMemory } from "@/runtime/memory/memory-graph";
import { getCognitionScores } from "@/runtime/intelligence/cognition-scoring";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { user, tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const db = getAdminClient();
  const [{ data: plans }, { data: checkpoints }, memoryGraph, cognitionScores] = await Promise.all([
    db.from("meta_orchestration_plans").select("*").eq("tenant_id", admin.tenantId).order("created_at", { ascending: false }).limit(25),
    db.from("orchestration_checkpoints").select("*").eq("tenant_id", admin.tenantId).order("created_at", { ascending: false }).limit(50),
    getMemoryGraph(admin.tenantId).catch(() => []),
    getCognitionScores(admin.tenantId).catch(() => []),
  ]);

  return NextResponse.json({ success: true, data: { plans: plans ?? [], checkpoints: checkpoints ?? [], memoryGraph, cognitionScores } });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "create_plan";

  try {
    if (action === "execute_plan") {
      if (typeof body?.plan_id !== "string") return NextResponse.json({ success: false, error: "plan_id required" }, { status: 400 });
      const data = await executeMetaOrchestrationPlan(body.plan_id);
      return NextResponse.json({ success: true, data });
    }

    if (action === "link_memory") {
      if (typeof body?.from_memory_id !== "string" || typeof body?.to_memory_id !== "string" || typeof body?.relation !== "string") {
        return NextResponse.json({ success: false, error: "from_memory_id, to_memory_id and relation required" }, { status: 400 });
      }
      const data = await linkMemory({
        tenantId: admin.tenantId,
        fromMemoryId: body.from_memory_id,
        toMemoryId: body.to_memory_id,
        relation: body.relation,
        weight: Number(body.weight ?? 0.5),
        metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
      });
      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    const workflows = Array.isArray(body?.workflows)
      ? body.workflows.filter((workflow): workflow is Record<string, unknown> => typeof workflow === "object" && workflow !== null)
      : [];
    if (typeof body?.objective !== "string" || !workflows.length) {
      return NextResponse.json({ success: false, error: "objective and workflows required" }, { status: 400 });
    }

    const data = await createMetaOrchestrationPlan({
      tenantId: admin.tenantId,
      objective: body.objective,
      workflows: workflows.map((workflow) => ({
        workflowType: String(workflow.workflowType ?? workflow.workflow_type ?? "ops_review"),
        eventType: typeof workflow.eventType === "string" ? workflow.eventType : typeof workflow.event_type === "string" ? workflow.event_type : undefined,
        capabilities: Array.isArray(workflow.capabilities) ? workflow.capabilities.filter((item): item is string => typeof item === "string") : undefined,
        payload: typeof workflow.payload === "object" && workflow.payload !== null ? workflow.payload as Record<string, unknown> : {},
        priority: Number(workflow.priority ?? body.priority ?? 50),
      })),
      priority: Number(body.priority ?? 50),
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Meta orchestration action failed" },
      { status: 500 }
    );
  }
}
