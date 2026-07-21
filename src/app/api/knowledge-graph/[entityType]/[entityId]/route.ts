import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy";
import {
  buildCustomerGraph,
  buildJobGraph,
  buildGraphSummary,
} from "@/lib/knowledge-graph";

export async function GET(
  request: NextRequest,
  { params }: { params: { entityType: string; entityId: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ??
    (profile?.tenant_id as string | null) ??
    DEFAULT_TENANT_ID;

  const { entityType, entityId } = params;

  let graph;
  if (entityType === "customer") {
    graph = await buildCustomerGraph(tenantId, entityId);
  } else if (entityType === "job") {
    graph = await buildJobGraph(tenantId, entityId);
  } else {
    graph = await buildGraphSummary(tenantId);
  }

  return NextResponse.json({ ok: true, entityType, entityId, graph });
}
