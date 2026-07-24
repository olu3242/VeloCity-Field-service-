// Enterprise Command Center — live operational visibility into the Execution Fabric.
// /admin/execution — server-rendered with real data from the WEF telemetry store.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { getFabricHealthSnapshot } from "@/lib/execution/engine";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";
import type { ExecutionMetrics } from "@/lib/execution/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function getAdminProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  return profile;
}

// ── Status utilities ──────────────────────────────────────────────────────────

function statusColor(status: string) {
  if (status === "completed") return "text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/50 border-green-200 dark:border-green-800";
  if (status === "failed") return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50 border-red-200 dark:border-red-800";
  if (status === "degraded") return "text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800";
  if (status === "running") return "text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800";
  return "text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-900 border-gray-200 dark:border-gray-700";
}

function healthDot(health: string) {
  if (health === "healthy") return "bg-green-500";
  if (health === "degraded") return "bg-yellow-500";
  return "bg-red-500";
}

function healthLabel(health: string) {
  if (health === "healthy") return "Healthy";
  if (health === "degraded") return "Degraded";
  return "Offline";
}

function fmt(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(0)}%`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ExecutionCommandCenter() {
  const profile = await getAdminProfile();
  const tenantId = getTenantId(profile);

  const supabase = getAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Recent execution traces
  const { data: rawTraces } = await supabase
    .from("system_events")
    .select("payload, created_at")
    .eq("tenant_id", tenantId)
    .eq("event_type", "execution.trace")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);

  // Recent WEF events stream
  const { data: rawEvents } = await supabase
    .from("system_events")
    .select("event_type, payload, created_at")
    .eq("tenant_id", tenantId)
    .like("event_type", "execution.%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  // AI plan events
  const { data: aiEvents } = await supabase
    .from("system_events")
    .select("payload, created_at")
    .eq("tenant_id", tenantId)
    .like("event_type", "ai.plan.%")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  // Metrics rows
  const { data: rawMetrics } = await supabase
    .from("system_events")
    .select("payload")
    .eq("tenant_id", tenantId)
    .eq("event_type", "execution.metrics")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  const traces = (rawTraces ?? []).map((r) => r.payload as Record<string, unknown>);
  const events = rawEvents ?? [];
  const metrics = (rawMetrics ?? []).map((r) => r.payload as unknown as ExecutionMetrics);
  const plans = (aiEvents ?? []).map((r) => r.payload as Record<string, unknown>);

  // Aggregate per workstream
  const byWorkstream: Record<string, { count: number; success: number; failed: number; totalMs: number; retries: number }> = {};
  for (const m of metrics) {
    if (!byWorkstream[m.workstream]) byWorkstream[m.workstream] = { count: 0, success: 0, failed: 0, totalMs: 0, retries: 0 };
    byWorkstream[m.workstream].count++;
    if (m.status === "completed") byWorkstream[m.workstream].success++;
    if (m.status === "failed") byWorkstream[m.workstream].failed++;
    byWorkstream[m.workstream].totalMs += m.durationMs;
    byWorkstream[m.workstream].retries += m.retryCount;
  }

  // Summary stats
  const totalExecutions = metrics.length;
  const successCount = metrics.filter((m) => m.status === "completed").length;
  const failedCount = metrics.filter((m) => m.status === "failed").length;
  const avgDuration = totalExecutions > 0
    ? metrics.reduce((acc, m) => acc + m.durationMs, 0) / totalExecutions
    : 0;

  // Platform + fabric health
  let platformHealth;
  try {
    platformHealth = await aggregatePlatformHealth(tenantId);
  } catch {
    platformHealth = null;
  }
  const fabricHealth = getFabricHealthSnapshot();

  const overallHealth = fabricHealth.openCircuits > 0
    ? "degraded"
    : platformHealth?.health ?? "healthy";

  const bannerColor =
    overallHealth === "healthy"
      ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
      : overallHealth === "degraded"
      ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";

  const bannerText =
    overallHealth === "healthy"
      ? "text-green-800 dark:text-green-200"
      : overallHealth === "degraded"
      ? "text-yellow-800 dark:text-yellow-200"
      : "text-red-800 dark:text-red-200";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Enterprise Command Center
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Workstream Execution Fabric — live operational visibility
        </p>
      </div>

      {/* Overall health banner */}
      <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${bannerColor}`}>
        <span className={`text-xl font-bold ${bannerText}`}>
          {overallHealth === "healthy" ? "✓" : overallHealth === "degraded" ? "⚠" : "✗"}
        </span>
        <div className={`flex-1 ${bannerText}`}>
          <p className="font-semibold">
            Execution Fabric — {healthLabel(overallHealth)}
          </p>
          <p className="text-sm opacity-80">
            {fabricHealth.openCircuits > 0
              ? `${fabricHealth.openCircuits} circuit(s) open · ${fabricHealth.activeCircuits} total`
              : "All circuits closed · Full execution capacity"}
          </p>
        </div>
        <p className="text-xs opacity-60 shrink-0 font-mono">
          {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Executions (24h)", value: totalExecutions.toString() },
          { label: "Success Rate", value: totalExecutions > 0 ? pct(successCount / totalExecutions) : "—" },
          { label: "Avg Duration", value: totalExecutions > 0 ? fmt(Math.round(avgDuration)) : "—" },
          { label: "AI Plans (24h)", value: plans.length.toString() },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1 tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Workstream execution matrix */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            Workstream Execution Matrix
          </h2>
        </div>
        {Object.keys(byWorkstream).length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 dark:text-gray-500 text-center">
            No execution data in the last 24 hours
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 font-medium">Workstream</th>
                  <th className="px-4 py-3 font-medium text-right">Executions</th>
                  <th className="px-4 py-3 font-medium text-right">Success</th>
                  <th className="px-4 py-3 font-medium text-right">Failed</th>
                  <th className="px-4 py-3 font-medium text-right">Avg Duration</th>
                  <th className="px-4 py-3 font-medium text-right">Retries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {Object.entries(byWorkstream).map(([ws, data]) => (
                  <tr key={ws} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-100 font-mono text-xs">
                      {ws}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {data.count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                      {data.success}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                      {data.failed > 0 ? data.failed : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {data.count > 0 ? fmt(Math.round(data.totalMs / data.count)) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {data.retries > 0 ? data.retries : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent execution traces */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
            Recent Executions
          </h2>
        </div>
        {traces.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 dark:text-gray-500 text-center">
            No execution traces in the last 24 hours
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Workstream / Workflow</th>
                  <th className="px-4 py-3 font-medium">Intent</th>
                  <th className="px-4 py-3 font-medium text-right">Duration</th>
                  <th className="px-4 py-3 font-medium text-right">Nodes</th>
                  <th className="px-4 py-3 font-medium text-right">AI</th>
                  <th className="px-4 py-3 font-medium">Correlation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {traces.slice(0, 20).map((t, i) => {
                  const status = String(t.status ?? "unknown");
                  return (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${statusColor(status)}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-700 dark:text-gray-300">
                        {String(t.workstream ?? "—")}
                        <span className="text-gray-400 dark:text-gray-500"> / </span>
                        {String(t.workflow ?? "—")}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                        {String(t.intent ?? "—")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {t.durationMs ? fmt(Number(t.durationMs)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-500">
                        {String(t.nodeCount ?? "—")}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-500">
                        {t.aiPlanned ? "✓" : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
                        {String(t.correlationId ?? "—").slice(0, 12)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI decisions + Event stream side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Decisions */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">AI Planning Decisions</h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {plans.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">No AI plans in the last 24 hours</p>
            ) : (
              plans.slice(0, 10).map((p, i) => (
                <div key={i} className="px-5 py-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-gray-700 dark:text-gray-300">{String(p.workstream ?? "—")}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500 dark:text-gray-400">risk {String(p.riskScore ?? "—")}</span>
                    {Number(p.riskScore) > 0.5 && (
                      <span className="text-yellow-600 dark:text-yellow-400 text-[10px]">⚠ high risk</span>
                    )}
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">
                    est. {p.estimatedDurationMs ? fmt(Number(p.estimatedDurationMs)) : "—"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Event stream */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Live Event Stream</h2>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-80 overflow-y-auto">
            {events.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">No events in the last 24 hours</p>
            ) : (
              events.slice(0, 30).map((e, i) => {
                const p = e.payload as Record<string, unknown>;
                const isFailure = e.event_type.includes("failed");
                const isSuccess = e.event_type.includes("completed");
                return (
                  <div key={i} className="px-5 py-2.5 text-xs flex items-start gap-3">
                    <span
                      className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${isFailure ? "bg-red-500" : isSuccess ? "bg-green-500" : "bg-blue-400"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-gray-700 dark:text-gray-300">{e.event_type}</span>
                      <span className="text-gray-400 dark:text-gray-500 ml-2">
                        {String(p.workstream ?? "")}
                      </span>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500 shrink-0">
                      {new Date(e.created_at).toISOString().slice(11, 19)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Platform dependency health */}
      {platformHealth && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
              Platform Dependencies
            </h2>
          </div>
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(platformHealth.dependencies ?? {}).map(([key, dep]) => {
              const d = dep as { health?: string; displayName?: string; latencyMs?: number };
              const h = d.health ?? "unknown";
              return (
                <div
                  key={key}
                  className="flex items-center gap-2.5 rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2.5"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${healthDot(h)}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {d.displayName ?? key}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">
                      {healthLabel(h)}
                      {d.latencyMs ? ` · ${d.latencyMs}ms` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Queue + Worker health */}
      {platformHealth && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              label: "Queue Depth",
              value: String((platformHealth.queues as { depth?: number })?.depth ?? "—"),
              sub: `${(platformHealth.queues as { stuckItems?: number })?.stuckItems ?? 0} stuck`,
              health: (platformHealth.queues as { health?: string })?.health ?? "unknown",
            },
            {
              label: "Worker Failures",
              value: `${(platformHealth.workers as { failedRuns?: number })?.failedRuns ?? 0}/${(platformHealth.workers as { totalRuns?: number })?.totalRuns ?? 0}`,
              sub: `${((platformHealth.workers as { failureRate?: number })?.failureRate ?? 0 * 100).toFixed(0)}% failure rate`,
              health: (platformHealth.workers as { health?: string })?.health ?? "unknown",
            },
            {
              label: "Circuit Breakers",
              value: `${fabricHealth.openCircuits}/${fabricHealth.activeCircuits}`,
              sub: fabricHealth.openCircuits === 0 ? "All closed" : `${fabricHealth.openCircuits} open`,
              health: fabricHealth.fabricHealth,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-5 py-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${healthDot(card.health)}`} />
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{card.label}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{card.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-gray-400 dark:text-gray-600 font-mono text-center">
        Workstream Execution Fabric — Command Center · {new Date().toISOString()}
      </p>
    </div>
  );
}
