// /admin/sla — SLA breach predictions, priority routes, escalation timers.
// Server-rendered; admin-only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { getAtRiskSLAs } from "@/lib/sla/breach-predictor";
import { getAllRoutes } from "@/lib/sla/priority-routing";
import { getPendingTimers, getTimerStats } from "@/lib/sla/escalation-timer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function riskBadge(status: string) {
  if (status === "breached") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (status === "at_risk") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
}

function urgencyBadge(urgency: string) {
  if (urgency === "emergency") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (urgency === "high") return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  if (urgency === "medium") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
}

function formatMs(ms: number): string {
  if (ms < 0) return `${Math.round(Math.abs(ms) / 1000)}s overdue`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

export default async function SlaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const atRisk = getAtRiskSLAs(tenantId);
  const routes = getAllRoutes();
  const pendingTimers = getPendingTimers(tenantId);
  const timerStats = getTimerStats();

  const breached = atRisk.filter((p) => p.predictedStatus === "breached");
  const atRiskOnly = atRisk.filter((p) => p.predictedStatus === "at_risk");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">SLA Monitor</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Breach predictions · priority routing · escalation timers
            </p>
          </div>
          <Link
            href="/admin/dashboard"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            ← Admin
          </Link>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Breached", value: breached.length, danger: breached.length > 0 },
            { label: "At Risk", value: atRiskOnly.length, warn: atRiskOnly.length > 0 },
            { label: "Pending Escalations", value: pendingTimers.length, warn: pendingTimers.length > 0 },
            { label: "Priority Routes", value: routes.length },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${
                s.danger ? "text-red-600 dark:text-red-400" :
                s.warn ? "text-yellow-600 dark:text-yellow-400" :
                "text-gray-900 dark:text-white"
              }`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* At-risk SLA entries */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              At-Risk &amp; Breached SLAs
            </h2>
            {atRisk.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">All SLAs are within safe thresholds.</p>
            ) : (
              <div className="space-y-2">
                {atRisk.map((p) => (
                  <div key={p.entryId} className="p-2 rounded bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {p.eventType}
                      </span>
                      <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${riskBadge(p.predictedStatus)}`}>
                        {p.predictedStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-mono">{p.entryId.slice(0, 8)}</span>
                      <span>{formatMs(p.timeRemainingMs)}</span>
                      <span>risk: {Math.round(p.riskScore)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Priority Routes */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Priority Routes</h2>
            {routes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No priority routes configured.</p>
            ) : (
              <div className="space-y-2">
                {routes.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{r.eventType}</span>
                    <span className={`rounded px-1.5 py-0.5 font-medium ${urgencyBadge(r.urgency)}`}>
                      {r.urgency}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">+{r.priorityBoost} boost</span>
                    <span className="text-gray-400">{formatMs(r.maxQueueWaitMs)} max wait</span>
                    {r.dedicatedWorker && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">dedicated</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Escalation Timers */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Escalation Timers</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {timerStats.total} total · {timerStats.pending} pending · {timerStats.fired} fired
            </span>
          </div>
          {pendingTimers.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No pending escalation timers.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Timer ID</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">SLA Entry</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Event</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Level</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Fires In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {pendingTimers.slice(0, 15).map((t) => (
                    <tr key={t.id}>
                      <td className="py-1.5 font-mono text-gray-400">{t.id.slice(0, 8)}</td>
                      <td className="py-1.5 font-mono text-gray-500 dark:text-gray-400">{t.slaEntryId.slice(0, 8)}</td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-300">{t.eventType}</td>
                      <td className="py-1.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${
                          t.escalationLevel === 3 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" :
                          t.escalationLevel === 2 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300" :
                          "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        }`}>
                          L{t.escalationLevel}
                        </span>
                      </td>
                      <td className="py-1.5 text-gray-500 dark:text-gray-400">
                        {formatMs(t.scheduledAt - Date.now())}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          SLA Monitor · {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
