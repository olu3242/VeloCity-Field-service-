// POST /api/automation/process — trigger queue processing (cron or manual)
// Protected by CRON_SECRET header

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { processAutomationQueue } from "@/lib/automation/worker";

export async function POST(request: NextRequest) {
  // Fails closed: an unset CRON_SECRET refuses the request rather than letting
  // it through. This route drains the automation queue, so an unauthenticated
  // caller could trigger real side effects.
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await processAutomationQueue();
    return NextResponse.json({ data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({ status: "ok", service: "automation-worker" });
}
