import { NextResponse } from "next/server";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { isRuntimePaused } from "@/lib/governance/operator";
import { generateEnterpriseCertification } from "@/lib/certification/enterprise-report";
import { checkRedisHealth } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const circuits = getAllCircuits();
  const openCount = circuits.filter((c) => c.state === "open").length;
  const paused = isRuntimePaused();
  const cert = generateEnterpriseCertification();
  const redisHealth = await checkRedisHealth();

  const supabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");
  const stripeConfigured =
    !!process.env.STRIPE_SECRET_KEY &&
    !process.env.STRIPE_SECRET_KEY.includes("sk_test_placeholder");
  const aiConfigured =
    !!process.env.ANTHROPIC_API_KEY &&
    !process.env.ANTHROPIC_API_KEY.includes("sk-ant-placeholder");

  let status: "healthy" | "degraded" | "unhealthy";
  if (cert.overallScore >= 85 && openCount === 0 && !paused) {
    status = "healthy";
  } else if (cert.overallScore >= 70 || openCount > 0) {
    status = "degraded";
  } else {
    status = "unhealthy";
  }

  return NextResponse.json({
    status,
    score: cert.overallScore,
    certified: cert.certified,
    certificationLevel: cert.certificationLevel,
    runtimePaused: paused,
    openCircuits: openCount,
    totalCircuits: circuits.length,
    subsystems: {
      supabase: supabaseConfigured ? "configured" : "not-configured",
      redis: redisHealth.configured
        ? redisHealth.reachable
          ? `ok (${redisHealth.latencyMs}ms)`
          : "unreachable"
        : "not-configured",
      stripe: stripeConfigured ? "configured" : "not-configured",
      ai: aiConfigured ? "configured" : "not-configured",
      distributedRuntime: redisHealth.configured ? "redis" : "in-memory",
    },
    checkedAt: new Date().toISOString(),
  });
}
