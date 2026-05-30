import type { SupabaseClient } from "@supabase/supabase-js";
import { RUNTIME_REGISTRY } from "@/lib/registry";
import { hasEnvGroup } from "@/lib/env";

export type DriftSeverity = "critical" | "high" | "medium" | "low";

export interface DriftItem {
  id: string;
  category: "runtime" | "event" | "security" | "auth" | "realtime" | "data" | "config";
  severity: DriftSeverity;
  description: string;
  affected: string;
  remediation: string;
  detected_at: string;
}

export async function detectDrift(db: SupabaseClient): Promise<DriftItem[]> {
  const drifts: DriftItem[] = [];
  const now = new Date().toISOString();

  // ── Config drift ─────────────────────────────────────────────
  if (!hasEnvGroup("supabase")) {
    drifts.push({ id: "cfg-supabase", category: "config", severity: "critical", description: "Supabase env vars are placeholder values", affected: "All portals, auth, data", remediation: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY", detected_at: now });
  }
  if (!hasEnvGroup("stripe")) {
    drifts.push({ id: "cfg-stripe", category: "config", severity: "critical", description: "Stripe env vars not configured", affected: "Payments Runtime", remediation: "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", detected_at: now });
  }
  if (!hasEnvGroup("ai")) {
    drifts.push({ id: "cfg-ai", category: "config", severity: "medium", description: "ANTHROPIC_API_KEY absent — agents using deterministic fallback", affected: "ALICE, NOVA, MAX, QUINN, REX agents", remediation: "Set ANTHROPIC_API_KEY", detected_at: now });
  }
  if (!hasEnvGroup("oauth")) {
    drifts.push({ id: "cfg-oauth", category: "auth", severity: "high", description: "Google OAuth not configured", affected: "Identity Runtime, auth/login, auth/signup", remediation: "Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, NEXTAUTH_SECRET", detected_at: now });
  }

  // ── Runtime drift ─────────────────────────────────────────────
  const orphaned = RUNTIME_REGISTRY.filter(r => r.status === "orphaned");
  for (const r of orphaned) {
    drifts.push({ id: `runtime-orphaned-${r.id}`, category: "runtime", severity: "critical", description: `Runtime "${r.name}" is orphaned — no app integration`, affected: r.name, remediation: "Connect runtime to app code or remove", detected_at: now });
  }

  const partial = RUNTIME_REGISTRY.filter(r => r.status === "partial");
  for (const r of partial) {
    drifts.push({ id: `runtime-partial-${r.id}`, category: "runtime", severity: "medium", description: `Runtime "${r.name}" partially connected (score ${r.score}/100)`, affected: r.name, remediation: r.notes ?? "Complete runtime wiring", detected_at: now });
  }

  // ── Database drift (only when Supabase configured) ────────────
  if (hasEnvGroup("supabase")) {
    try {
      const { count: stuckJobs } = await db
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "awaiting_match")
        .lt("created_at", new Date(Date.now() - 4 * 3600 * 1000).toISOString());
      if ((stuckJobs ?? 0) > 0) {
        drifts.push({ id: "data-stuck-jobs", category: "data", severity: "high", description: `${stuckJobs} jobs stuck in awaiting_match > 4 hours`, affected: "Job Runtime, Dispatch Runtime", remediation: "Trigger /api/cron/automation to re-dispatch", detected_at: now });
      }

      const { count: deadLetterCount } = await db
        .from("automation_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "dead_letter");
      if ((deadLetterCount ?? 0) > 0) {
        drifts.push({ id: "data-dead-letter", category: "event", severity: "high", description: `${deadLetterCount} events in dead letter queue`, affected: "Automation Runtime", remediation: "Review and replay events via /api/admin/runtime", detected_at: now });
      }

      const { count: failedAutomations } = await db
        .from("automation_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", new Date(Date.now() - 3600 * 1000).toISOString());
      if ((failedAutomations ?? 0) > 5) {
        drifts.push({ id: "data-failed-automations", category: "event", severity: "high", description: `${failedAutomations} automation failures in last hour`, affected: "Automation Runtime", remediation: "Check /admin/command-center for error details", detected_at: now });
      }
    } catch {
      // DB queries optional when Supabase not configured
    }
  }

  // ── Realtime drift ─────────────────────────────────────────────
  const realtimePortals = ["Customer Dashboard", "Provider Dashboard", "Admin Dashboard", "Franchise Dashboard"];
  for (const portal of realtimePortals) {
    drifts.push({ id: `realtime-${portal.toLowerCase().replace(/ /g, "-")}`, category: "realtime", severity: "low", description: `${portal} lacks Supabase Realtime subscription`, affected: portal, remediation: "Add RealtimeJobUpdates component (pattern: DispatchLiveQueue)", detected_at: now });
  }

  return drifts.sort((a, b) => {
    const order: Record<DriftSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}

export function getDriftScore(drifts: DriftItem[]): number {
  const penalties: Record<DriftSeverity, number> = { critical: 25, high: 10, medium: 4, low: 1 };
  const total = drifts.reduce((sum, d) => sum + (penalties[d.severity] ?? 0), 0);
  return Math.max(0, 100 - total);
}
