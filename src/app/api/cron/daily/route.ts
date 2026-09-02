// GET /api/cron/daily — territory analysis, provider scoring, retention campaigns
// Runs once per day at 3 AM

import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/auth";
import { emitEvent } from "@/lib/automation/emitEvent";
import { processAutomationQueue } from "@/lib/automation/worker";
import { emitDueMembershipServices, emitExpiringMemberships } from "@/lib/membership/membershipLifecycle";

export async function GET(request: NextRequest) {
  // allowQueryParam preserves the ?secret= form this route's deployed cron
  // schedule still uses. Header auth is preferred; drop the flag once the
  // schedule sends x-cron-secret instead.
  const unauthorized = authorizeCron(request, { allowQueryParam: true });
  if (unauthorized) return unauthorized;

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
