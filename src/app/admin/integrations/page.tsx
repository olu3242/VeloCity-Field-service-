// /admin/integrations — Adapter health, dead-letter queue, webhook stats.
// Server-rendered; admin-only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { buildHealthReport } from "@/lib/integrations/integration-health";
import { getDeliveryStats, getDeadLetterQueue } from "@/lib/integrations/delivery-tracker";
import { getWebhookStats } from "@/lib/integrations/webhook-normalizer";
import { ADAPTER_REGISTRY } from "@/lib/integrations/adapter-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function healthBadge(health: string) {
  if (health === "critical") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (health === "degraded") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
}

function statusDot(status: string) {
  if (status === "offline") return "bg-red-500";
  if (status === "degraded") return "bg-yellow-500";
  if (status === "healthy") return "bg-green-500";
  return "bg-gray-400";
}

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  getTenantId(profile);

  const healthReport = buildHealthReport();
  const deliveryStats = getDeliveryStats();
  const deadLetterItems = getDeadLetterQueue().slice(0, 20);
  const webhookStats = getWebhookStats();
  const registeredAdapters = Array.from(ADAPTER_REGISTRY.values());

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Integrations</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Adapter health · delivery pipeline · webhook processing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${healthBadge(healthReport.overallHealth)}`}>
              {healthReport.overallHealth}
            </span>
            <Link
              href="/admin/dashboard"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← Admin
            </Link>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Adapters",
              value: healthReport.adapters.length,
            },
            {
              label: "Dead Letter",
              value: deliveryStats.deadLetter,
              danger: deliveryStats.deadLetter > 5,
            },
            {
              label: "Deliveries",
              value: deliveryStats.total,
            },
            {
              label: "Webhooks",
              value: webhookStats.total,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${
                s.danger ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
              }`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Alerts */}
        {healthReport.alerts.length > 0 && (
          <div className="bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900 p-4">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
              {healthReport.alerts.length} Alert{healthReport.alerts.length !== 1 ? "s" : ""}
            </h2>
            <ul className="space-y-1">
              {healthReport.alerts.map((a, i) => (
                <li key={i} className="text-sm text-red-600 dark:text-red-300">{a}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Adapter health */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Adapters ({healthReport.adapters.length})
            </h2>
            {healthReport.adapters.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No adapters registered.</p>
            ) : (
              <div className="space-y-2">
                {healthReport.adapters.map((a) => (
                  <div key={a.adapterId} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${statusDot(a.status)}`} />
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{a.adapterId} · {a.type}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-gray-700 dark:text-gray-300">
                        {Math.round(a.successRate * 100)}% success
                      </div>
                      <div className="text-gray-400">{Math.round(a.avgLatencyMs)}ms avg</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {registeredAdapters.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                No adapters in registry. POST to /api/admin/integrations with action=register_adapter.
              </p>
            )}
          </div>

          {/* Delivery pipeline */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Delivery Pipeline</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: "Total", value: deliveryStats.total },
                { label: "Delivered", value: deliveryStats.delivered, ok: true },
                { label: "Failed", value: deliveryStats.failed, warn: deliveryStats.failed > 0 },
                { label: "Dead Letter", value: deliveryStats.deadLetter, danger: deliveryStats.deadLetter > 0 },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
                  <div className={`text-lg font-semibold tabular-nums ${
                    s.danger ? "text-red-600 dark:text-red-400" :
                    s.warn ? "text-yellow-600 dark:text-yellow-400" :
                    s.ok ? "text-green-600 dark:text-green-400" :
                    "text-gray-900 dark:text-white"
                  }`}>{s.value}</div>
                </div>
              ))}
            </div>

            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Webhook Stats</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total webhooks</span>
                <span className="text-gray-900 dark:text-white tabular-nums">{webhookStats.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Duplicates blocked</span>
                <span className="text-gray-900 dark:text-white tabular-nums">{webhookStats.duplicatesBlocked}</span>
              </div>
              {Object.entries(webhookStats.bySource).map(([src, count]) => (
                <div key={src} className="flex justify-between">
                  <span className="text-gray-400 font-mono">{src}</span>
                  <span className="text-gray-700 dark:text-gray-300 tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dead-letter queue */}
        {deadLetterItems.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Dead Letter Queue ({deliveryStats.deadLetter})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Delivery ID</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Adapter</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Event Type</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Attempts</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Error</th>
                    <th className="pb-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {deadLetterItems.map((d) => (
                    <tr key={d.deliveryId}>
                      <td className="py-1.5 font-mono text-gray-400">{d.deliveryId.slice(0, 12)}</td>
                      <td className="py-1.5 text-gray-600 dark:text-gray-400">{d.adapterId}</td>
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">{d.eventType}</td>
                      <td className="py-1.5 text-center text-yellow-600 dark:text-yellow-400">{d.attemptCount}</td>
                      <td className="py-1.5 text-red-600 dark:text-red-400 truncate max-w-32">{d.error ?? "—"}</td>
                      <td className="py-1.5 text-gray-400">{d.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          Integrations · {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
