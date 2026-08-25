// GET /api/cron/sla — SLA check + stuck job detection + expired offer cleanup
// Runs every minute via Vercel Cron / external scheduler

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { runSLACheck, detectStuckJobs, detectExpiredOffers } from "@/lib/automation/sla";
import { processAutomationQueue } from "@/lib/automation/worker";

export async function GET(request: NextRequest) {
  // allowQueryParam preserves the ?secret= form this route's deployed cron
  // schedule still uses. Header auth is preferred; drop the flag once the
  // schedule sends x-cron-secret instead.
  const unauthorized = authorizeCron(request, { allowQueryParam: true });
  if (unauthorized) return unauthorized;

  try {
    const [slaResult, stuckCount, expiredCount] = await Promise.all([
      runSLACheck(),
      detectStuckJobs(),
      detectExpiredOffers(),
    ]);

    // Also process queue on each SLA tick
    const workerResult = await processAutomationQueue();

    return NextResponse.json({
      data: {
        sla: slaResult,
        stuck_jobs: stuckCount,
        expired_offers: expiredCount,
        queue: workerResult,
        ran_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/sla]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
