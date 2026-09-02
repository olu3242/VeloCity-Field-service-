// GET  /api/admin/integrations — adapter health report, delivery stats, dead-letter items, webhook stats
// POST /api/admin/integrations — register_adapter | replay_webhook
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  buildHealthReport,
} from "@/lib/integrations/integration-health";
import {
  registerAdapter,
  ADAPTER_REGISTRY,
  type AdapterContract,
} from "@/lib/integrations/adapter-contract";
import {
  getDeliveryStats,
  getDeadLetterQueue,
} from "@/lib/integrations/delivery-tracker";
import {
  getWebhookStats,
  replayWebhook,
} from "@/lib/integrations/webhook-normalizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);

  const healthReport = buildHealthReport();
  const deliveryStats = getDeliveryStats();
  const deadLetterItems = getDeadLetterQueue();
  const webhookStats = getWebhookStats();
  const registeredAdapters = Array.from(ADAPTER_REGISTRY.values());

  return NextResponse.json({
    health: healthReport,
    delivery: {
      stats: deliveryStats,
      deadLetterItems: deadLetterItems.slice(0, 50),
    },
    webhooks: webhookStats,
    registeredAdapters,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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

  if (action === "register_adapter") {
    const { adapterId, name, type, version, supportsRetry, supportsWebhook, supportsReplay, maxRetries, timeoutMs } =
      body as Record<string, unknown>;

    if (typeof adapterId !== "string" || typeof name !== "string") {
      return NextResponse.json({ error: "adapterId and name required" }, { status: 400 });
    }

    const VALID_TYPES = ["payment", "notification", "crm", "erp", "analytics", "ai_provider", "logistics", "communication"];
    if (typeof type !== "string" || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const contract: AdapterContract = {
      adapterId,
      name,
      type: type as AdapterContract["type"],
      version: typeof version === "string" ? version : "1.0.0",
      enabled: true,
      supportsRetry: supportsRetry !== false,
      supportsWebhook: supportsWebhook === true,
      supportsReplay: supportsReplay === true,
      maxRetries: typeof maxRetries === "number" ? maxRetries : 3,
      timeoutMs: typeof timeoutMs === "number" ? timeoutMs : 30_000,
    };

    registerAdapter(contract);
    return NextResponse.json({ action: "register_adapter", contract, success: true });
  }

  if (action === "replay_webhook") {
    const { webhookId } = body as Record<string, unknown>;
    if (typeof webhookId !== "string") {
      return NextResponse.json({ error: "webhookId required" }, { status: 400 });
    }

    const result = replayWebhook(webhookId);
    if (!result) {
      return NextResponse.json({ error: "Webhook not found or not replayable" }, { status: 404 });
    }
    return NextResponse.json({ action: "replay_webhook", result, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'register_adapter' or 'replay_webhook'.` },
    { status: 400 }
  );
}
