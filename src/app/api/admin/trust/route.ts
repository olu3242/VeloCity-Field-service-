// GET  /api/admin/trust — untrusted providers, provider trust, customer reputation, signal summary
// POST /api/admin/trust — update_provider_trust | update_reputation | record_signal
// Admin-only; tenant-scoped.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  updateProviderTrust,
  getProviderTrust,
  getUntrustedProviders,
  type TrustSignal,
} from "@/lib/trust/provider-trust";
import {
  updateReputation,
  getReputation,
} from "@/lib/trust/customer-reputation";
import {
  recordTrustSignal,
  getSignalsForEntity,
  getSignalSummary,
} from "@/lib/trust/trust-signals";

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

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const customerId = url.searchParams.get("customerId");
  const entityId = url.searchParams.get("entityId");
  const signalLimit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  if (providerId) {
    const trust = getProviderTrust(providerId);
    const signals = getSignalsForEntity(providerId, signalLimit);
    return NextResponse.json({ tenantId, providerId, trust, signals, generatedAt: new Date().toISOString() });
  }

  if (customerId) {
    const reputation = getReputation(customerId);
    const signals = getSignalsForEntity(customerId, signalLimit);
    return NextResponse.json({ tenantId, customerId, reputation, signals, generatedAt: new Date().toISOString() });
  }

  if (entityId) {
    const signals = getSignalsForEntity(entityId, signalLimit);
    const summary = getSignalSummary(entityId);
    return NextResponse.json({ tenantId, entityId, signals, summary, generatedAt: new Date().toISOString() });
  }

  const untrustedProviders = getUntrustedProviders(tenantId);
  const untrustedSummary = {
    total: untrustedProviders.length,
    blocked: untrustedProviders.filter((p) => p.level === "blocked").length,
    atRisk: untrustedProviders.filter((p) => p.level === "at_risk").length,
  };

  return NextResponse.json({
    tenantId,
    untrustedProviders,
    summary: untrustedSummary,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
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

  if (action === "update_provider_trust") {
    const { providerId, signals } = body as Record<string, unknown>;
    if (typeof providerId !== "string") {
      return NextResponse.json({ error: "providerId required" }, { status: 400 });
    }
    if (!Array.isArray(signals)) {
      return NextResponse.json({ error: "signals array required" }, { status: 400 });
    }
    const score = updateProviderTrust(providerId, tenantId, signals as TrustSignal[]);
    return NextResponse.json({ action: "update_provider_trust", score, success: true });
  }

  if (action === "update_reputation") {
    const { customerId, disputeCount, resolvedInFavor, paymentReliability } = body as Record<string, unknown>;
    if (typeof customerId !== "string") {
      return NextResponse.json({ error: "customerId required" }, { status: 400 });
    }
    const reputation = updateReputation(customerId, tenantId, {
      ...(typeof disputeCount === "number" ? { disputeCount } : {}),
      ...(typeof resolvedInFavor === "number" ? { resolvedInFavor } : {}),
      ...(typeof paymentReliability === "number" ? { paymentReliability } : {}),
    });
    return NextResponse.json({ action: "update_reputation", reputation, success: true });
  }

  if (action === "record_signal") {
    const { entityId, entityType, signalType, value } = body as Record<string, unknown>;
    if (typeof entityId !== "string" || typeof signalType !== "string") {
      return NextResponse.json({ error: "entityId and signalType required" }, { status: 400 });
    }
    if (!["provider", "customer"].includes(entityType as string)) {
      return NextResponse.json({ error: "entityType must be 'provider' or 'customer'" }, { status: 400 });
    }
    const event = recordTrustSignal(
      entityId,
      entityType as "provider" | "customer",
      tenantId,
      signalType,
      typeof value === "number" ? value : 1
    );
    return NextResponse.json({ action: "record_signal", event, success: true });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}. Use 'update_provider_trust', 'update_reputation', or 'record_signal'.` },
    { status: 400 }
  );
}
