// GET /api/automation/status — dashboard stats for admin UI

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getPlatformHealth } from "@/lib/contracts/health";
import { getSystemHealth } from "@/runtime/health/system-health";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const db = getAdminClient();
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

    const [
      { count: pendingCount },
      { count: failedCount },
      { count: completedCount },
      { data: recentRuns },
      { data: recentEvents },
      { count: pendingPayouts },
      { count: deadLetters },
      { data: workers },
      health,
      systemHealth,
    ] = await Promise.all([
      db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
      db.from("automation_queue").select("*", { count: "exact", head: true }).eq("status", "completed").gte("created_at", since),
      db.from("automation_runs").select("id, event_type, handler, status, duration_ms, error_message, created_at").order("created_at", { ascending: false }).limit(20),
      db.from("automation_events").select("id, event_type, status, created_at").order("created_at", { ascending: false }).limit(20),
      db.from("payout_queue").select("*", { count: "exact", head: true }).eq("status", "queued"),
      db.from("automation_dead_letters").select("*", { count: "exact", head: true }).eq("status", "open"),
      db.from("worker_heartbeats").select("worker_id,status,last_seen_at,processed_count,failed_count").order("last_seen_at", { ascending: false }).limit(5),
      getPlatformHealth(),
      getSystemHealth(),
    ]);

    return NextResponse.json({
      data: {
        queue: { pending: pendingCount ?? 0, failed: failedCount ?? 0, completed_24h: completedCount ?? 0 },
        recent_runs: recentRuns ?? [],
        recent_events: recentEvents ?? [],
        payouts_pending: pendingPayouts ?? 0,
        dead_letters_open: deadLetters ?? 0,
        workers: workers ?? [],
        health,
        system_health: systemHealth,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
