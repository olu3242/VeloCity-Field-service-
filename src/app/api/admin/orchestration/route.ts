import { NextRequest, NextResponse } from "next/server";
import { getActiveAgents } from "@/lib/agents/registry";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { runOrchestration } from "@/runtime/orchestration/agent-orchestrator";

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
  const [{ data: runs }, { data: tasks }] = await Promise.all([
    db.from("orchestration_runs").select("*").eq("tenant_id", admin.tenantId).order("started_at", { ascending: false }).limit(25),
    db.from("orchestration_tasks").select("*").eq("tenant_id", admin.tenantId).order("created_at", { ascending: false }).limit(50),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      agents: getActiveAgents(),
      runs: runs ?? [],
      tasks: tasks ?? [],
    },
  });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.workflow_type !== "string") {
    return NextResponse.json({ success: false, error: "workflow_type required" }, { status: 400 });
  }

  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.filter((capability): capability is string => typeof capability === "string")
    : undefined;

  try {
    const data = await runOrchestration({
      tenantId: admin.tenantId,
      actorId: admin.user.id,
      workflowType: body.workflow_type,
      eventType: typeof body.event_type === "string" ? body.event_type : undefined,
      capabilities,
      priority: Number(body.priority ?? 50),
      source: "api.admin.orchestration",
      payload: typeof body.payload === "object" && body.payload !== null ? body.payload as Record<string, unknown> : {},
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Orchestration failed" },
      { status: 500 }
    );
  }
}
