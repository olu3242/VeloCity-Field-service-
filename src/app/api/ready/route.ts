// GET /api/ready — Kubernetes/load-balancer readiness probe.
// Returns 200 when the instance is ready to accept traffic,
// 503 when it is not (e.g., startup not complete, critical deps missing).

import { NextResponse } from "next/server";
import { isRuntimePaused } from "@/lib/governance/operator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");
  const stripeConfigured =
    !!process.env.STRIPE_SECRET_KEY &&
    !process.env.STRIPE_SECRET_KEY.includes("sk_test_placeholder");
  const cronConfigured =
    !!process.env.CRON_SECRET &&
    !process.env.CRON_SECRET.includes("placeholder");
  const paused = isRuntimePaused();

  const ready =
    supabaseConfigured && stripeConfigured && cronConfigured && !paused;

  const body = {
    ready,
    checks: {
      supabase: supabaseConfigured,
      stripe: stripeConfigured,
      cron: cronConfigured,
      runtimeActive: !paused,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
