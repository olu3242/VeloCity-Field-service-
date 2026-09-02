// /admin/customers — customer listing with churn risk, LTV, and job counts.
// Server-rendered; admin-only.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenancy";
import { formatCents, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function churnBadge(risk: string | null) {
  if (risk === "high") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800";
  if (risk === "medium") return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
  return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-800";
}

export default async function AdminCustomersPage() {
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

  const adminClient = getAdminClient();

  const [customersResult, metricsResult] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, full_name, email, created_at, phone")
      .eq("tenant_id", tenantId)
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(200),

    adminClient
      .from("velocity_customer_formula_view")
      .select("id, completed_jobs_count, lifetime_value, churn_risk_label, last_booking_date")
      .eq("tenant_id", tenantId)
      .limit(200),
  ]);

  type CustomerRow = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string;
  };

  type MetricsRow = {
    id: string;
    completed_jobs_count: number | null;
    lifetime_value: number | null;
    churn_risk_label: string | null;
    last_booking_date: string | null;
  };

  const customers = (customersResult.data ?? []) as CustomerRow[];
  const metricsMap = new Map<string, MetricsRow>(
    ((metricsResult.data ?? []) as MetricsRow[]).map((m) => [m.id, m])
  );

  const highRisk = customers.filter((c) => metricsMap.get(c.id)?.churn_risk_label === "high").length;
  const mediumRisk = customers.filter((c) => metricsMap.get(c.id)?.churn_risk_label === "medium").length;
  const totalLTV = customers.reduce((s, c) => s + (metricsMap.get(c.id)?.lifetime_value ?? 0), 0);
  const avgLTV = customers.length > 0 ? totalLTV / customers.length : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Customers</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {customers.length} customers · tenant {tenantId.slice(0, 8)}
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
            { label: "Total Customers", value: customers.length },
            { label: "High Churn Risk", value: highRisk, danger: highRisk > 0 },
            { label: "Medium Churn Risk", value: mediumRisk, warn: mediumRisk > 0 },
            { label: "Avg LTV", value: formatCents(Math.round(avgLTV)) },
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

        {/* Customer table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">All Customers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-left bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Customer</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Contact</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Jobs</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">LTV</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Churn Risk</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Last Booking</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Joined</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                      No customers found.
                    </td>
                  </tr>
                )}
                {customers.map((c) => {
                  const m = metricsMap.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {c.full_name ?? "—"}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{c.id.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">
                        <div>{c.email ?? "—"}</div>
                        {c.phone && <div className="text-xs">{c.phone}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white text-center">
                        {m?.completed_jobs_count ?? 0}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white tabular-nums">
                        {formatCents(m?.lifetime_value ?? 0)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs rounded border px-1.5 py-0.5 font-medium ${churnBadge(m?.churn_risk_label ?? null)}`}>
                          {m?.churn_risk_label ?? "new"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                        {m?.last_booking_date ? formatDateTime(m.last_booking_date) : "Never"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                        {formatDateTime(c.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-gray-400 dark:text-gray-600 text-right">
          {new Date().toISOString()}
        </div>
      </div>
    </div>
  );
}
