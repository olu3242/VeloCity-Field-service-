// Operator Copilot — AI-assisted operational intelligence interface.
// /admin/copilot — server-rendered; reads copilot memory and suggestions from the lib.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { getAllCircuits } from "@/lib/governance/circuit-breaker";
import { getOperatorState } from "@/lib/governance/operator";
import { getQueryStats } from "@/lib/operator-copilot/query-engine";
import { generateSuggestion, getActiveSuggestions } from "@/lib/operator-copilot/action-suggester";
import { aggregatePlatformHealth } from "@/lib/workstream/health-aggregator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getAdminProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");
  return { user, profile };
}

function priorityColor(priority: string) {
  if (priority === "urgent") return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50 border-red-200 dark:border-red-800";
  if (priority === "high") return "text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800";
  if (priority === "medium") return "text-yellow-700 bg-yellow-50 dark:text-yellow-300 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800";
  return "text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-900 border-gray-200 dark:border-gray-700";
}

function intentBadge(intent: string) {
  if (intent === "diagnostic") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (intent === "action") return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (intent === "forecast") return "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
  if (intent === "status") return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
}

export default async function OperatorCopilotPage() {
  const { user, profile } = await getAdminProfile();
  const tenantId = getTenantId(profile);

  const circuits = getAllCircuits();
  const openCircuits = circuits.filter((c) => c.state === "open").length;
  const opState = getOperatorState();
  const queryStats = getQueryStats();

  // Generate a fresh suggestion from current platform state
  const suggestion = generateSuggestion("page-load", {
    openCircuits,
    degradedComponents: openCircuits,
    queueDepth: 0,
    errorRate: circuits.length > 0 ? openCircuits / circuits.length : 0,
  });

  const activeSuggestions = getActiveSuggestions();

  // Pull recent copilot queries from enterprise_memory
  let recentQueries: Array<{
    id: string;
    summary: string;
    detail: Record<string, unknown>;
    created_at: string;
  }> = [];
  try {
    const { data } = await getAdminClient()
      .from("enterprise_memory")
      .select("id, summary, detail, created_at")
      .eq("tenant_id", tenantId)
      .eq("category", "copilot_query")
      .order("created_at", { ascending: false })
      .limit(20);
    recentQueries = (data ?? []) as typeof recentQueries;
  } catch {
    // enterprise_memory may not be migrated yet — non-fatal
  }

  // Platform health for context
  let platformHealthStr = "unknown";
  try {
    const health = await aggregatePlatformHealth(tenantId);
    platformHealthStr = health.health;
  } catch {
    // non-fatal
  }

  const healthDotColor =
    platformHealthStr === "healthy" ? "bg-green-500" :
    platformHealthStr === "degraded" ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Operator Copilot</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              AI-assisted operational intelligence for {profile?.full_name ?? profile?.email ?? "admin"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className={`w-2 h-2 rounded-full ${healthDotColor}`} />
            Platform {platformHealthStr}
          </div>
        </div>

        {/* Suggestion Banner */}
        {suggestion && (
          <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${priorityColor(suggestion.priority)}`}>
            <div className="mt-0.5 text-lg">
              {suggestion.priority === "urgent" ? "🚨" :
               suggestion.priority === "high" ? "⚠️" :
               suggestion.priority === "medium" ? "💡" : "ℹ️"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{suggestion.suggestedAction}</div>
              <div className="text-sm mt-0.5 opacity-80">{suggestion.rationale}</div>
              <div className="text-xs mt-1 opacity-60">
                Estimated impact: {suggestion.estimatedImpact}
                {suggestion.requiresApproval && " · Requires approval"}
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Queries", value: queryStats.total },
            { label: "Avg Confidence", value: `${(queryStats.avgConfidence * 100).toFixed(0)}%` },
            { label: "Open Circuits", value: openCircuits },
            { label: "Active Suggestions", value: activeSuggestions.length },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Query interface notice + query form */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Ask the Copilot</h2>
          <form action="/api/admin/copilot" method="POST" className="flex gap-2">
            <input type="hidden" name="_action" value="query" />
            <input
              name="query"
              type="text"
              placeholder="e.g. 'Why is DISPATCH failing?' or 'Show status of all circuits'"
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Ask
            </button>
          </form>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Copilot understands status, diagnostic, action, forecast, and history queries.
            POST to <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">/api/admin/copilot</code> for programmatic access.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Active Suggestions */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Active Suggestions
              {activeSuggestions.length > 0 && (
                <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5">
                  {activeSuggestions.length}
                </span>
              )}
            </h2>
            {activeSuggestions.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No active suggestions — platform is stable.</p>
            ) : (
              <div className="space-y-2">
                {activeSuggestions.slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-start gap-2 p-2 rounded-md bg-gray-50 dark:bg-gray-800">
                    <span className={`mt-0.5 text-xs rounded border px-1.5 py-0.5 font-medium ${priorityColor(s.priority)}`}>
                      {s.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 dark:text-white">{s.suggestedAction}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.rationale}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Platform Context */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Platform Context</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Runtime</span>
                <span className={opState.runtimePaused ? "text-red-500" : "text-green-500"}>
                  {opState.runtimePaused ? "Paused" : "Active"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total Circuits</span>
                <span className="text-gray-900 dark:text-white">{circuits.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Open Circuits</span>
                <span className={openCircuits > 0 ? "text-red-500" : "text-green-500"}>{openCircuits}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Intent Distribution</span>
                <span className="text-gray-400 text-xs">
                  {Object.entries(queryStats.byIntent).map(([k, v]) => `${k}:${v}`).join(" · ") || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Queries from enterprise_memory */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent Query History</h2>
          {recentQueries.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No saved query history yet. Queries with confidence ≥ 70% are persisted.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 text-left">
                    <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Query</th>
                    <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Intent</th>
                    <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Confidence</th>
                    <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentQueries.map((q) => {
                    const detail = (q.detail ?? {}) as Record<string, unknown>;
                    const intent = (detail.intent as string) ?? "—";
                    const confidence = (detail.confidence as number) ?? 0;
                    const queryText = (detail.queryText as string) ?? q.summary;
                    return (
                      <tr key={q.id}>
                        <td className="py-2 pr-4 text-gray-900 dark:text-white max-w-xs truncate">{queryText}</td>
                        <td className="py-2 pr-4">
                          <span className={`text-xs rounded-full px-2 py-0.5 ${intentBadge(intent)}`}>{intent}</span>
                        </td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                          {(confidence * 100).toFixed(0)}%
                        </td>
                        <td className="py-2 text-gray-400 text-xs">
                          {new Date(q.created_at).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          Operator Copilot · {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
