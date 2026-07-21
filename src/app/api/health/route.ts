import { NextResponse } from "next/server";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { isRuntimePaused } from "@/lib/governance/operator";
import { generateEnterpriseCertification } from "@/lib/certification/enterprise-report";

export async function GET() {
  const circuits = getAllCircuits();
  const openCount = circuits.filter((c) => c.state === "open").length;
  const paused = isRuntimePaused();
  const cert = generateEnterpriseCertification();

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
    checkedAt: new Date().toISOString(),
  });
}
