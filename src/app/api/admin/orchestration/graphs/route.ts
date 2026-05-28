import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { createExecutionGraph, executeGraph } from "@/runtime/orchestration/execution-graph";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const db = getAdminClient();
  const [{ data: graphs }, { data: nodes }] = await Promise.all([
    db.from("execution_graphs").select("*").eq("tenant_id", admin.tenantId).order("created_at", { ascending: false }).limit(25),
    db.from("execution_graph_nodes").select("*").eq("tenant_id", admin.tenantId).order("priority", { ascending: false }).limit(100),
  ]);

  return NextResponse.json({ success: true, data: { graphs: graphs ?? [], nodes: nodes ?? [] } });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "create_graph";

  try {
    if (action === "execute_graph") {
      if (typeof body?.graph_id !== "string") return NextResponse.json({ success: false, error: "graph_id required" }, { status: 400 });
      const data = await executeGraph(body.graph_id, Number(body.concurrency ?? 3));
      return NextResponse.json({ success: true, data });
    }

    const nodes = Array.isArray(body?.nodes)
      ? body.nodes.filter((node): node is Record<string, unknown> => typeof node === "object" && node !== null)
      : [];
    if (!nodes.length) return NextResponse.json({ success: false, error: "nodes required" }, { status: 400 });

    const data = await createExecutionGraph({
      tenantId: admin.tenantId,
      planId: typeof body?.plan_id === "string" ? body.plan_id : undefined,
      nodes: nodes.map((node) => ({
        nodeKey: String(node.nodeKey ?? node.node_key),
        workflowType: String(node.workflowType ?? node.workflow_type),
        dependencies: Array.isArray(node.dependencies) ? node.dependencies.filter((item): item is string => typeof item === "string") : [],
        priority: Number(node.priority ?? 50),
        payload: typeof node.payload === "object" && node.payload !== null ? node.payload as Record<string, unknown> : {},
        capabilities: Array.isArray(node.capabilities) ? node.capabilities.filter((item): item is string => typeof item === "string") : undefined,
      })),
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Execution graph action failed" }, { status: 500 });
  }
}
