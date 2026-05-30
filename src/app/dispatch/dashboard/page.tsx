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
import type { Job } from "@/types";

export default async function DispatchDashboard() {
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

  if (profile?.role !== "dispatcher") redirect("/dashboard");

  const [
    { count: awaitingMatchCount },
    { count: offerSentCount },
    { data: activeJobs },
    { count: providersOnlineCount },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "awaiting_match"),
    supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "offer_sent"),
    supabase
      .from("jobs")
      .select("*")
      .not(
        "status",
        "in",
        '("completed","closed","cancelled","expired","refunded","draft")'
      )
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("providers")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("is_online", true),
  ]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Dispatch Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-xl text-[#CCFF00]">
            ⚡ VeloCity Dispatch
          </Link>
          <div className="flex items-center gap-1 text-xs">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-white/60 hover:text-white"
          >
            <Link href="/admin/jobs">Jobs</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-white/60 hover:text-white"
          >
            <Link href="/admin/providers">Providers</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Dispatch Center</h1>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            {
              label: "Awaiting Match",
              value: awaitingMatchCount?.toLocaleString() ?? "0",
              color: awaitingMatchCount
                ? "text-yellow-400"
                : "text-white",
            },
            {
              label: "Offers Sent",
              value: offerSentCount?.toLocaleString() ?? "0",
              color: offerSentCount ? "text-[#CCFF00]" : "text-white",
            },
            {
              label: "Providers Online",
              value: providersOnlineCount?.toLocaleString() ?? "0",
              color:
                (providersOnlineCount ?? 0) > 0
                  ? "text-green-400"
                  : "text-white",
            },
            {
              label: "Active Jobs",
              value: activeJobs?.length?.toLocaleString() ?? "0",
              color: "text-white",
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

        {/* Jobs Queue */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Active Jobs Queue</h2>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-[#CCFF00]"
            >
              <Link href="/admin/jobs">View all →</Link>
            </Button>
          </div>

          {!activeJobs?.length ? (
            <div className="rounded-lg border border-white/10 bg-gray-900 py-12 text-center text-white/40">
              No active jobs right now.
            </div>
          ) : (
            <div className="space-y-2">
              {activeJobs.map((job: Job) => (
                <Link key={job.id} href={`/admin/jobs/${job.id}`}>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-gray-900 p-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {SERVICE_CATEGORY_ICONS[job.category]}
                      </span>
                      <div>
                        <div className="font-medium text-sm">{job.title}</div>
                        <div className="text-xs text-white/40">
                          {job.city}, {job.state} •{" "}
                          {formatDateTime(job.created_at)}
                        </div>
                      </div>
                    </div>
                    <Badge className={JOB_STATUS_COLORS[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
