import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { emitEvent } from "@/lib/automation/emitEvent";
import { getAdminClient } from "@/lib/supabase/admin";
import { consumeApiRateLimit } from "@/runtime/api/rate-limit";
import { createCorrelationId, getCorrelationIdFromRequest } from "@/runtime/telemetry/correlation";

export const runtime = "nodejs";

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function authenticate(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-velocity-key");
  if (!token) return null;

  const db = getAdminClient();
  const keyHash = hashKey(token);
  const { data } = await db
    .from("platform_api_keys")
    .select("id, tenant_id, scopes, status")
    .eq("key_hash", keyHash)
    .eq("status", "active")
    .maybeSingle();

  if (!data) return null;

  await db.from("platform_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => null);
  return data as { id: string; tenant_id: string; scopes: string[] };
}

export async function POST(request: NextRequest) {
  const apiKey = await authenticate(request);
  if (!apiKey) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!apiKey.scopes.includes("events:write") && !apiKey.scopes.includes("*")) {
    return NextResponse.json({ success: false, error: "Missing events:write scope" }, { status: 403 });
  }

  const rate = await consumeApiRateLimit({
    tenantId: apiKey.tenant_id,
    apiKeyId: apiKey.id,
    route: "/api/platform/events",
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded", data: rate },
      { status: 429, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": rate.resetAt } }
    );
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.event_type !== "string") {
    return NextResponse.json({ success: false, error: "event_type required" }, { status: 400 });
  }

  const correlationId = getCorrelationIdFromRequest(request, "api") ?? createCorrelationId("api");
  const payload = {
    ...(typeof body.payload === "object" && body.payload !== null ? body.payload as Record<string, unknown> : {}),
    tenant_id: apiKey.tenant_id,
    correlation_id: correlationId,
    partner_api_key_id: apiKey.id,
  };

  const result = await emitEvent(body.event_type, payload, typeof body.dedup_key === "string" ? body.dedup_key : undefined);
  await getAdminClient().from("usage_meter_events").insert({
    tenant_id: apiKey.tenant_id,
    subject_id: apiKey.id,
    metric: "api_requests",
    quantity: 1,
    unit_cost_usd: 0,
    source: "platform_api",
    correlation_id: correlationId,
    metadata: { route: "/api/platform/events", event_type: body.event_type, queued: result.queued },
  }).then(() => null);

  const status = result.error ? 500 : result.duplicate ? 202 : 201;
  return NextResponse.json(
    { success: !result.error, data: result, error: result.error },
    { status, headers: { "x-ratelimit-remaining": String(rate.remaining), "x-ratelimit-reset": rate.resetAt } }
  );
}
