// GET /api/live — Kubernetes liveness probe.
// Returns 200 as long as the process is alive and responsive.
// Never returns 5xx from this route (if it does, the process is truly broken).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { alive: true, timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
