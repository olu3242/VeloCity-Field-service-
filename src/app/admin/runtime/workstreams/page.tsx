import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";
import type { WorkstreamHealth, DependencyHealth } from "@/lib/workstream/types";

// ── Health display helpers ────────────────────────────────────────────────────

function HealthDot({ health }: { health: WorkstreamHealth | DependencyHealth }) {
  const classes: Record<string, string> = {
    healthy: "bg-green-500",
    degraded: "bg-yellow-400",
    offline: "bg-red-500",
    recovering: "bg-blue-400",
    unknown: "bg-gray-400",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${classes[health] ?? "bg-gray-400"}`}
    />
  );
}

function HealthBadge({ health }: { health: WorkstreamHealth | DependencyHealth }) {
  const styles: Record<string, string> = {
    healthy: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    degraded: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    offline: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    recovering: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    unknown: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  const label = health.charAt(0).toUpperCase() + health.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${styles[health] ?? styles.unknown}`}
    >
      <HealthDot health={health} />
      {label}
    </span>
  );
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    dispatch: "Dispatch",
    payments: "Payments",
    ai: "AI",
    automation: "Automation",
    franchise: "Franchise",
    customer: "Customer",
    provider: "Provider",
    admin: "Admin",
    intelligence: "Intelligence",
  };
  return labels[cat] ?? cat;
}

function categoryColor(cat: string): string {
  const colors: Record<string, string> = {
    dispatch: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    payments: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    ai: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    automation: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    franchise: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    customer: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    provider: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    intelligence: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    admin: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return colors[cat] ?? colors.admin;
}

function overallBanner(health: WorkstreamHealth) {
  if (health === "healthy")
    return { bg: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800", text: "text-green-800 dark:text-green-200", icon: "✅", label: "All Systems Operational" };
  if (health === "degraded")
    return { bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800", text: "text-yellow-800 dark:text-yellow-200", icon: "⚠", label: "Platform Degraded — Some Workstreams Affected" };
  return { bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", text: "text-red-800 dark:text-red-200", icon: "🔴", label: "Platform Offline — Critical Services Down" };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function WorkstreamRuntimePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  const tenantId = getTenantId(profile);
  const report = await aggregatePlatformHealth(tenantId);
  const banner = overallBanner(report.health);

  const workstreamList = Object.values(report.workstreams);
  const criticalFailing = workstreamList.filter(
    (w) => w.critical && w.health !== "healthy",
  ).length;
  const totalDegraded = workstreamList.filter((w) => w.health !== "healthy").length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Nav */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <Link href="/admin/dashboard" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Admin</Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <Link href="/admin/runtime" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Runtime</Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">Workstreams</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-mono">{report.generatedAt.slice(0, 19).replace("T", " ")} UTC</span>
          <Link href="/admin/runtime/workstreams" className="text-xs text-velocity-600 hover:underline">Refresh</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Overall banner */}
        <div className={`rounded-xl border px-6 py-4 flex items-center gap-3 ${banner.bg}`}>
          <span className="text-xl">{banner.icon}</span>
          <div className="flex-1">
            <p className={`font-semibold ${banner.text}`}>{banner.label}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {criticalFailing} critical{" "}
              {criticalFailing === 1 ? "workstream" : "workstreams"} failing ·{" "}
              {totalDegraded} total degraded · Runtime:{" "}
              <span className="font-medium">{report.runtime.mode}</span>
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Workstreams", value: workstreamList.length },
            { label: "Critical Failing", value: criticalFailing, warn: criticalFailing > 0 },
            { label: "Queue Depth", value: report.queues.automation.depth },
            { label: "Recent Worker Failures", value: report.workers.automation.recentFailures, warn: report.workers.automation.recentFailures > 0 },
          ].map(({ label, value, warn }) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${warn ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Workstream Health Matrix */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Workstream Health Matrix
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3">Workstream</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">Health</th>
                    <th className="text-right px-4 py-3">Latency</th>
                    <th className="text-right px-4 py-3">SLA</th>
                    <th className="text-right px-4 py-3">Failures</th>
                    <th className="text-center px-4 py-3">Critical</th>
                    <th className="text-left px-4 py-3">Dependencies</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {workstreamList.map((ws) => (
                    <tr
                      key={ws.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${ws.health !== "healthy" ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {ws.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryColor(ws.category)}`}>
                          {categoryLabel(ws.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <HealthBadge health={ws.health} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {ws.latencyMs != null ? (
                          <span className={ws.slaViolation ? "text-red-600 font-medium" : ""}>
                            {ws.latencyMs}ms
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                        {(ws.slaMs / 1000).toFixed(1)}s
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={ws.recentFailures > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                          {ws.recentFailures}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ws.critical ? (
                          <span className="text-orange-500" title="Critical workstream">●</span>
                        ) : (
                          <span className="text-gray-200 dark:text-gray-700">○</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ws.dependencies.map((d) => (
                            <span
                              key={d.name}
                              title={`${d.displayName ?? d.name}: ${d.health}`}
                              className={`h-2 w-2 rounded-full ${
                                d.health === "healthy"
                                  ? "bg-green-400"
                                  : d.health === "degraded"
                                  ? "bg-yellow-400"
                                  : d.health === "offline"
                                  ? "bg-red-400"
                                  : "bg-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Platform Dependency Map */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Platform Dependency Map
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.values(report.dependencies).map((dep) => (
              <div
                key={dep.name}
                className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {dep.displayName ?? dep.name}
                  </span>
                  <HealthBadge health={dep.health} />
                </div>
                {dep.latencyMs != null && (
                  <p className="text-xs text-gray-400 font-mono">{dep.latencyMs}ms</p>
                )}
                {dep.error && (
                  <p className="text-xs text-red-500 mt-1 truncate" title={dep.error}>
                    {dep.error}
                  </p>
                )}
                <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1 font-mono">
                  {dep.critical ? "CRITICAL" : "optional"}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Queue + Workers + Runtime */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Automation Queue */}
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Automation Queue
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Health</dt>
                <dd><HealthBadge health={report.queues.automation.health} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Queue Depth</dt>
                <dd className="font-mono text-gray-900 dark:text-gray-100">{report.queues.automation.depth}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Stuck Items</dt>
                <dd className={`font-mono ${report.queues.automation.stuck > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>
                  {report.queues.automation.stuck}
                </dd>
              </div>
            </dl>
          </section>

          {/* Workers */}
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Automation Workers
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Health</dt>
                <dd><HealthBadge health={report.workers.automation.health} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Recent Failures (1h)</dt>
                <dd className={`font-mono ${report.workers.automation.recentFailures > 0 ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>
                  {report.workers.automation.recentFailures}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Last Run</dt>
                <dd className="text-gray-600 dark:text-gray-400 text-xs">
                  {report.workers.automation.lastRun
                    ? report.workers.automation.lastRun.slice(0, 19).replace("T", " ")
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>

          {/* Runtime */}
          <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Runtime Mode
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Mode</dt>
                <dd className={`font-medium ${report.runtime.mode === "distributed" ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}>
                  {report.runtime.mode === "distributed" ? "Distributed" : "Standalone"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Rate Limiting</dt>
                <dd className="text-gray-700 dark:text-gray-300 text-xs">
                  {report.runtime.rateLimitMode}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Circuit Breakers</dt>
                <dd className="font-mono text-gray-900 dark:text-gray-100">{report.runtime.circuitBreakerCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Tracing</dt>
                <dd className={`text-xs ${report.runtime.tracingEnabled ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                  {report.runtime.tracingEnabled ? "W3C Enabled" : "Disabled"}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* API info */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">API: </span>
          GET /api/admin/runtime/workstreams
          <span className="mx-3 text-gray-300 dark:text-gray-600">·</span>
          Returns full JSON health report for monitoring integrations and the deployment gate.
        </div>
      </div>
    </div>
  );
}
