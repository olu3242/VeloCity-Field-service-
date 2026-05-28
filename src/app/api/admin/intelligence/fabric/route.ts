import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { recallContextMemory, storeContextMemory } from "@/runtime/memory/context-fabric";
import { getEventIntelligenceSummary } from "@/runtime/intelligence/event-intelligence";
import { generateAutonomousRecommendations, getAutonomousRecommendations } from "@/runtime/intelligence/autonomous-ops";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { user, tenantId: getTenantId(profile) };
}

export async function GET(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const scope = request.nextUrl.searchParams.get("scope") ?? undefined;
  const [memory, events, recommendations] = await Promise.all([
    recallContextMemory({ tenantId: admin.tenantId, scope: scope as never, limit: 50 }).catch(() => []),
    getEventIntelligenceSummary(admin.tenantId).catch(() => null),
    getAutonomousRecommendations(admin.tenantId).catch(() => []),
  ]);

  return NextResponse.json({ success: true, data: { memory, events, recommendations } });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "generate_recommendations";

  try {
    if (action === "store_memory") {
      if (typeof body?.scope !== "string" || typeof body?.context_key !== "string") {
        return NextResponse.json({ success: false, error: "scope and context_key required" }, { status: 400 });
      }
      const data = await storeContextMemory({
        tenantId: admin.tenantId,
        scope: body.scope as never,
        contextKey: body.context_key,
        value: typeof body.value === "object" && body.value !== null ? body.value as Record<string, unknown> : {},
        subjectId: typeof body.subject_id === "string" ? body.subject_id : undefined,
        workflowId: typeof body.workflow_id === "string" ? body.workflow_id : undefined,
      });
      return NextResponse.json({ success: true, data }, { status: 201 });
    }

    const data = await generateAutonomousRecommendations(admin.tenantId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Intelligence fabric action failed" },
      { status: 500 }
    );
  }
}
