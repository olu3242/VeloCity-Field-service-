import { NextResponse } from "next/server";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { isRuntimePaused } from "@/lib/governance/operator";
import { generateEnterpriseCertification } from "@/lib/certification/enterprise-report";

export async function GET() {
  const circuits = getAllCircuits();
  const runtimePaused = isRuntimePaused();
  const cert = generateEnterpriseCertification();

  const circuitDetails = circuits.map((c) => ({
    key: c.key,
    state: c.state,
    failureCount: c.failureCount,
  }));

  return NextResponse.json({
    ok: true,
    certification: cert,
    circuits: circuitDetails,
    runtimePaused,
    checkedAt: new Date().toISOString(),
  });
}
