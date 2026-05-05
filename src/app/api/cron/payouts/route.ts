// GET /api/cron/payouts — process ready payouts + retry failed ones
// Runs every hour

import { NextRequest, NextResponse } from "next/server";
import { processReadyPayouts } from "@/lib/automation/sla";
import { processAutomationQueue } from "@/lib/automation/worker";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
