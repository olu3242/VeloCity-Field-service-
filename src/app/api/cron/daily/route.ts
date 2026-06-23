// GET /api/cron/daily — territory analysis, provider scoring, retention campaigns
// Runs once per day at 3 AM

import { NextRequest, NextResponse } from "next/server";
import { emitEvent } from "@/lib/automation/emitEvent";
import { processAutomationQueue } from "@/lib/automation/worker";
import { emitDueMembershipServices, emitExpiringMemberships } from "@/lib/membership/membershipLifecycle";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    // Emit daily jobs with date-based dedup keys
    await Promise.all([
      emitEvent("daily_territory_analysis", { date: today }, `territory:${today}`),
      emitEvent("provider_scoring",          { date: today }, `scoring:${today}`),
      emitEvent("retention_campaign",        { date: today, trigger: "daily" }, `retention_daily:${today}`),
    ]);

    // Membership lifecycle: activates the previously-dead subscription_due
    // event for memberships whose next_service_date has arrived, and emits
    // membership_expiring for renewals within 7 days (Batch X+2, Phase 8).
    const [dueServices, expiringMemberships] = await Promise.all([
      emitDueMembershipServices(),
      emitExpiringMemberships(),
    ]);

    // Process immediately
    const workerResult = await processAutomationQueue();

    return NextResponse.json({
      data: {
        jobs_emitted: ["daily_territory_analysis", "provider_scoring", "retention_campaign"],
        membership_service_due_emitted: dueServices,
        membership_expiring_emitted: expiringMemberships,
        queue: workerResult,
        ran_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
