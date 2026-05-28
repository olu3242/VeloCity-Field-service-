// POST /api/automation/process — trigger queue processing (cron or manual)
// Protected by CRON_SECRET header

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/config/env";
import { processAutomationQueue } from "@/lib/automation/worker";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  const expected = env.cronSecret;

  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
