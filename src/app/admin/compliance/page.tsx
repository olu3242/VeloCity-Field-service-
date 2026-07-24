// /admin/compliance — Compliance dashboard: policies, alerts, retention, audit coverage.
// Server-rendered; admin-only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  POLICIES,
  executeAllPolicies,
  getPolicyViolations,
  getLatestResult,
} from "@/lib/compliance/policy-executor";
import {
  getViolations,
  getRetentionComplianceScore,
} from "@/lib/compliance/retention-enforcer";
import {
  getUnacknowledgedAlerts,
  getAlertStats,
} from "@/lib/compliance/compliance-alert";
import {
  getAverageCoverage,
  getRecentChecks,
} from "@/lib/compliance/audit-checker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function severityBadge(severity: string) {
  if (severity === "critical") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (severity === "warning") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
}

function scoreBadge(score: number) {
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export default async function CompliancePage() {
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

  // Run policies to get fresh results
  executeAllPolicies();

  const policiesWithLatest = POLICIES.map((p) => ({
    ...p,
    latestResult: getLatestResult(p.policyId) ?? null,
  }));

  const policyViolations = getPolicyViolations();
  const retentionViolations = getViolations(tenantId);
  const unacknowledgedAlerts = getUnacknowledgedAlerts();
  const alertStats = getAlertStats();
  const retentionScore = Math.round(getRetentionComplianceScore());
  const avgCoverage = Math.round(getAverageCoverage() * 100);
  const recentChecks = getRecentChecks(undefined, 8);

  const criticalAlerts = unacknowledgedAlerts.filter((a) => a.severity === "critical");
  const passedPolicies = policiesWithLatest.filter((p) => p.latestResult?.passed).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Compliance</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Policy status · retention enforcement · audit coverage
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
            {
              label: "Policies Passing",
              value: `${passedPolicies}/${policiesWithLatest.length}`,
              warn: passedPolicies < policiesWithLatest.length,
            },
            {
              label: "Critical Alerts",
              value: criticalAlerts.length,
              danger: criticalAlerts.length > 0,
            },
            {
              label: "Retention Score",
              value: `${retentionScore}%`,
              warn: retentionScore < 90,
            },
            {
              label: "Audit Coverage",
              value: `${avgCoverage}%`,
              warn: avgCoverage < 80,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${
                s.danger ? "text-red-600 dark:text-red-400" :
                s.warn ? "text-yellow-600 dark:text-yellow-400" :
                "text-green-600 dark:text-green-400"
              }`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Policies */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Policies</h2>
            <div className="space-y-2">
              {policiesWithLatest.map((p) => (
                <div
                  key={p.policyId}
                  className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{p.policyId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${severityBadge(p.severity)}`}>
                      {p.severity}
                    </span>
                    {p.latestResult && (
                      <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${
                        p.latestResult.passed
                          ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                          : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      }`}>
                        {p.latestResult.passed ? "pass" : "fail"}
                      </span>
                    )}
                    {!p.latestResult && (
                      <span className="text-xs rounded px-1.5 py-0.5 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        not run
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {policyViolations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                  {policyViolations.length} policy violation{policyViolations.length !== 1 ? "s" : ""}
                </div>
                {policyViolations.slice(0, 3).map((v) => (
                  <div key={v.policyId + v.executedAt} className="text-xs text-gray-500 dark:text-gray-400">
                    {v.policyId}: {v.findings.join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Unacknowledged Alerts
              </h2>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {alertStats.total} total · {alertStats.unacknowledged} open
              </div>
            </div>

            {/* Severity breakdown */}
            <div className="flex gap-2 mb-3">
              {Object.entries(alertStats.bySeverity).map(([sev, count]) => (
                <div key={sev} className={`text-xs rounded px-2 py-1 font-medium ${severityBadge(sev)}`}>
                  {sev}: {count}
                </div>
              ))}
              {Object.keys(alertStats.bySeverity).length === 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">No alerts</span>
              )}
            </div>

            <div className="space-y-2">
              {unacknowledgedAlerts.slice(0, 8).map((a) => (
                <div key={a.id} className="p-2 rounded bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${severityBadge(a.severity)}`}>
                      {a.severity}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{a.id.slice(0, 8)}</span>
                  </div>
                  <div className="text-xs text-gray-700 dark:text-gray-300">{a.detail}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {a.createdAt.slice(0, 16).replace("T", " ")}
                    {a.policyId && ` · ${a.policyId}`}
                  </div>
                </div>
              ))}
              {unacknowledgedAlerts.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">No unacknowledged alerts.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Retention Violations */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Retention Violations</h2>
              <span className={`text-sm font-semibold ${scoreBadge(retentionScore)}`}>
                Score: {retentionScore}%
              </span>
            </div>
            {retentionViolations.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No open retention violations.</p>
            ) : (
              <div className="space-y-1.5">
                {retentionViolations.slice(0, 10).map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-gray-500 dark:text-gray-400">{v.id.slice(0, 8)}</span>
                    <span className="text-gray-600 dark:text-gray-400 capitalize">{v.category}</span>
                    <span className="text-red-600 dark:text-red-400">
                      {Math.round(v.ageInDays)}d / {v.retentionDays}d limit
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Coverage */}
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Completeness</h2>
              <span className={`text-sm font-semibold ${scoreBadge(avgCoverage)}`}>
                {avgCoverage}% avg
              </span>
            </div>
            {recentChecks.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No audit completeness checks recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {recentChecks.map((c) => (
                  <div key={c.checkId} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-400">{c.domain}</span>
                    <span className={`font-semibold ${scoreBadge(Math.round(c.coverage * 100))}`}>
                      {Math.round(c.coverage * 100)}%
                    </span>
                    <span className={`rounded px-1 py-0.5 ${
                      c.passed
                        ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    }`}>
                      {c.passed ? "pass" : "fail"}
                    </span>
                    <span className="text-gray-400">{c.checkedAt.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          Compliance · {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
