import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCents,
  formatDateTime,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
} from "@/lib/utils";

export default async function FranchiseDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "franchise_owner") redirect("/dashboard");

  // Query data — handle missing tables gracefully
  const [territoriesResult, jobsResult, providersResult] = await Promise.all([
    supabase
      .from("franchise_territories")
      .select("*")
      .eq("owner_user_id", user.id)
      .limit(10),
    supabase
      .from("jobs")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("providers")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved"),
  ]);

  // If franchise_territories table doesn't exist, fall back to empty array
  const territories: Record<string, unknown>[] =
    territoriesResult.error ? [] : (territoriesResult.data ?? []);
  const totalJobs = jobsResult.count ?? 0;
  const activeProviders = providersResult.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Franchise Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-xl text-[#CCFF00]">
            ⚡ VeloCity Franchise
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-white/60 hover:text-white"
          >
            <Link href="/franchise/territory">Territory</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-white/60 hover:text-white"
          >
            <Link href="/franchise/revenue">Revenue</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-white/60 hover:text-white"
          >
            <Link href="/franchise/providers">Providers</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Franchise Dashboard</h1>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            {
              label: "Territories",
              value: territories.length.toLocaleString(),
              color: "text-[#CCFF00]",
            },
            {
              label: "Total Jobs",
              value: totalJobs.toLocaleString(),
              color: "text-white",
            },
            {
              label: "Active Providers",
              value: activeProviders.toLocaleString(),
              color:
                activeProviders > 0 ? "text-green-400" : "text-white",
            },
            {
              label: "Monthly Revenue",
              value: "$—",
              color: "text-white/40",
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-gray-900 border-white/10">
              <CardContent className="pt-6">
                <div className={`text-4xl font-bold ${kpi.color}`}>
                  {kpi.value}
                </div>
                <div className="text-sm text-white/50 mt-1">{kpi.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Territory List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Territories</h2>
          </div>

          {territories.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-gray-900 py-12 text-center text-white/40">
              No territories assigned — contact your franchise administrator.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">
                      Territory Name
                    </th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">
                      Zip Code
                    </th>
                    <th className="px-4 py-3 text-left text-white/60 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {territories.map((territory, idx) => (
                    <tr
                      key={(territory.id as string) ?? idx}
                      className="bg-gray-900/50 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {(territory.name as string) ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {(territory.zip_code as string) ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            territory.status === "active"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : "bg-white/10 text-white/50 border-white/10"
                          }
                        >
                          {(territory.status as string) ?? "unknown"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <p className="mt-8 text-sm text-white/30 text-center">
          Revenue attribution and royalty reporting available in the Revenue tab.
        </p>
      </div>
    </div>
  );
}
