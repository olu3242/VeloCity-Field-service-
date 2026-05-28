import { NextRequest, NextResponse } from "next/server";
import { getAllThresholds } from "@/lib/ai-quality/confidence-threshold";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getAiGovernanceSummary, recordAiGovernanceDecision } from "@/runtime/ai/governance";

export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if ((profile as { role?: string } | null)?.role !== "admin") return null;
  return { user, tenantId: getTenantId(profile) };
}

export async function GET() {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  try {
    const summary = await getAiGovernanceSummary(admin.tenantId);
    return NextResponse.json({ success: true, data: { thresholds: getAllThresholds(), summary } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "AI governance unavailable" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminProfile();
  if (!admin) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.agent !== "string" || typeof body.domain !== "string" || typeof body.action !== "string") {
    return NextResponse.json({ success: false, error: "agent, domain and action required" }, { status: 400 });
  }

  const confidence = Number(body.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return NextResponse.json({ success: false, error: "confidence must be 0..1" }, { status: 400 });
  }

  try {
    const data = await recordAiGovernanceDecision({
      tenantId: admin.tenantId,
      actorId: admin.user.id,
      agent: body.agent,
      domain: body.domain,
      action: body.action,
      confidence,
      promptTokens: Number(body.prompt_tokens ?? 0),
      completionTokens: Number(body.completion_tokens ?? 0),
      latencyMs: Number(body.latency_ms ?? 0),
      fallbackUsed: Boolean(body.fallback_used),
      metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata as Record<string, unknown> : {},
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "AI governance write failed" },
      { status: 500 }
    );
  }
}
