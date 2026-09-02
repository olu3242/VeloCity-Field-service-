// GET /api/cron/payouts — process ready payouts + retry failed ones
// Runs every hour

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { processReadyPayouts } from "@/lib/automation/sla";
import { processAutomationQueue } from "@/lib/automation/worker";

export async function GET(request: NextRequest) {
  // allowQueryParam preserves the ?secret= form this route's deployed cron
  // schedule still uses. Header auth is preferred; drop the flag once the
  // schedule sends x-cron-secret instead.
  const unauthorized = authorizeCron(request, { allowQueryParam: true });
  if (unauthorized) return unauthorized;

  try {
    const [payoutsQueued, workerResult] = await Promise.all([
      processReadyPayouts(),
      processAutomationQueue(),
    ]);

    return NextResponse.json({
      data: {
        payouts_queued: payoutsQueued,
        queue: workerResult,
        ran_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/payouts]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
