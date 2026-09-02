// GET /api/admin/launch-readiness — system-wide launch readiness check
// Verifies database connectivity, required env vars, auth, Stripe, and platform health.
// Admin + super_admin only.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { getFabricHealthSnapshot } from "@/lib/execution/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ReadinessCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  detail: string;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, user: null, profile: null };
  }

  return { error: null, status: 200 as const, user, profile };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const tenantId = getTenantId(auth.profile);
  const checks: ReadinessCheck[] = [];

  // ── 1. Required environment variables ────────────────────────────────────────
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "ANTHROPIC_API_KEY",
    "CRON_SECRET",
  ];

  const missing = required.filter((v) => {
    const val = process.env[v];
    return !val || val.includes("placeholder") || val.includes("your-");
  });

  checks.push({
    name: "Required env vars",
    status: missing.length === 0 ? "pass" : "fail",
    detail: missing.length === 0
      ? `All ${required.length} required variables set`
      : `Missing or placeholder: ${missing.join(", ")}`,
  });

  // ── 2. Optional env vars ──────────────────────────────────────────────────────
  const optional = ["UPSTASH_REDIS_REST_URL", "TWILIO_ACCOUNT_SID", "SENDGRID_API_KEY"];
  const missingOptional = optional.filter((v) => !process.env[v]);
  checks.push({
    name: "Optional env vars",
    status: missingOptional.length === 0 ? "pass" : "warn",
    detail: missingOptional.length === 0
      ? "All optional services configured"
      : `Not configured (graceful fallback active): ${missingOptional.join(", ")}`,
  });

  // ── 3. Database connectivity ──────────────────────────────────────────────────
  try {
    const supabase = getAdminClient();
    const start = Date.now();
    const { error } = await supabase.from("profiles").select("id").limit(1);
    const latencyMs = Date.now() - start;

    checks.push({
      name: "Database connectivity",
      status: error ? "fail" : "pass",
      detail: error
        ? `Supabase error: ${error.message}`
        : `Connected — ${latencyMs}ms`,
    });
  } catch (err) {
    checks.push({
      name: "Database connectivity",
      status: "fail",
      detail: err instanceof Error ? err.message : "Connection failed",
    });
  }

  // ── 4. Key tables exist ───────────────────────────────────────────────────────
  const tables = [
    "profiles", "jobs", "providers", "payments", "bookings",
    "system_events", "revenue_records", "enterprise_memory",
    "commission_ledger", "metered_usage_events",
  ];

  const tableResults: Record<string, boolean> = {};
  const supabase = getAdminClient();
  await Promise.all(
    tables.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select("id").limit(1);
        tableResults[table] = !error;
      } catch {
        tableResults[table] = false;
      }
    })
  );

  const missingTables = tables.filter((t) => !tableResults[t]);
  checks.push({
    name: "Required tables",
    status: missingTables.length === 0 ? "pass" : "fail",
    detail: missingTables.length === 0
      ? `All ${tables.length} tables reachable`
      : `Missing or inaccessible: ${missingTables.join(", ")}`,
  });

  // ── 5. Stripe connectivity ────────────────────────────────────────────────────
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const isLiveStripe = stripeKey?.startsWith("sk_live_");
  const isTestStripe = stripeKey?.startsWith("sk_test_");
  checks.push({
    name: "Stripe key mode",
    status: isLiveStripe ? "pass" : isTestStripe ? "warn" : "fail",
    detail: isLiveStripe
      ? "Live key configured"
      : isTestStripe
        ? "Test key — switch to sk_live_ for production"
        : "Stripe key not configured or invalid format",
  });

  // ── 6. Webhook secret ────────────────────────────────────────────────────────
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  checks.push({
    name: "Stripe webhook secret",
    status: webhookSecret?.startsWith("whsec_") ? "pass" : "fail",
    detail: webhookSecret?.startsWith("whsec_")
      ? "Webhook secret configured"
      : "STRIPE_WEBHOOK_SECRET must start with whsec_",
  });

  // ── 7. Execution Fabric health ───────────────────────────────────────────────
  try {
    const fabricHealth = getFabricHealthSnapshot();
    checks.push({
      name: "Execution Fabric",
      status: fabricHealth.fabricHealth === "healthy" ? "pass" :
               fabricHealth.fabricHealth === "degraded" ? "warn" : "fail",
      detail: `${fabricHealth.fabricHealth} — ${fabricHealth.openCircuits}/${fabricHealth.activeCircuits} circuits open`,
    });
  } catch (err) {
    checks.push({
      name: "Execution Fabric",
      status: "warn",
      detail: err instanceof Error ? err.message : "Health check unavailable",
    });
  }

  // ── 8. App URL configured ────────────────────────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const isLocalhost = !appUrl || appUrl.includes("localhost");
  checks.push({
    name: "App URL",
    status: isLocalhost ? "warn" : "pass",
    detail: isLocalhost
      ? `NEXT_PUBLIC_APP_URL is ${appUrl ?? "not set"} — set to production domain before launch`
      : `Configured: ${appUrl}`,
  });

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;

  const overall: "ready" | "blocked" | "warnings" =
    failed > 0 ? "blocked" : warned > 0 ? "warnings" : "ready";

  return NextResponse.json({
    overall,
    tenantId,
    summary: { passed, failed, warned, total: checks.length },
    checks,
    generatedAt: new Date().toISOString(),
  });
}
