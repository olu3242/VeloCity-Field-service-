import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  SERVICE_CATEGORY_ICONS,
  formatDateTime,
} from "@/lib/utils";
import type { ServiceCategory } from "@/types";

interface DisputeJob {
  title: string;
  category: string;
  customer_id: string;
  provider_id: string;
  final_cost_cents: number | null;
}

interface DisputeRow {
  id: string;
  status: string;
  reason: string;
  created_at: string;
  job_id: string;
  jobs: DisputeJob | null;
}

function getDaysOpen(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "open": return "bg-red-800 text-red-200";
    case "under_review": return "bg-yellow-800 text-yellow-200";
    case "resolved": return "bg-green-800 text-green-200";
    case "closed": return "bg-gray-700 text-gray-300";
    default: return "bg-gray-700 text-gray-300";
  }
}

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: allDisputesRaw } = await supabase
    .from("disputes")
    .select("id, status, reason, created_at, job_id, jobs!disputes_job_id_fkey(title, category, customer_id, provider_id, final_cost_cents)")
    .order("created_at", { ascending: false });

  const allDisputes = (allDisputesRaw ?? []) as unknown as DisputeRow[];

  const openCount = allDisputes.filter(d => d.status === "open").length;
  const underReviewCount = allDisputes.filter(d => d.status === "under_review").length;
  const resolvedCount = allDisputes.filter(d => d.status === "resolved").length;
  const totalCount = allDisputes.length;

  const filtered = filterStatus
    ? allDisputes.filter(d => d.status === filterStatus)
    : allDisputes;

  const tabStatuses = [
    { label: "All", value: undefined },
    { label: "Open", value: "open" },
    { label: "Under Review", value: "under_review" },
    { label: "Resolved", value: "resolved" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Dispute Queue</h1>
            {openCount > 0 && (
              <span className="px-2 py-1 rounded-full bg-red-800 text-red-200 text-xs font-bold">
                {openCount} open
              </span>
            )}
          </div>
          <Link href="/admin/dashboard" className="text-sm text-white/50 hover:text-white/80">
            ← Dashboard
          </Link>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: totalCount, color: "text-white" },
            { label: "Open", value: openCount, color: openCount > 0 ? "text-red-400" : "text-white" },
            { label: "Under Review", value: underReviewCount, color: underReviewCount > 0 ? "text-yellow-400" : "text-white" },
            { label: "Resolved", value: resolvedCount, color: "text-green-400" },
          ].map(stat => (
            <Card key={stat.label} className="bg-white/5 border-white/10">
              <CardContent className="pt-6">
                <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-sm text-white/50 mt-1">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {tabStatuses.map(tab => {
            const href = tab.value ? `/admin/disputes?status=${tab.value}` : "/admin/disputes";
            const isActive = filterStatus === tab.value || (!filterStatus && !tab.value);
            return (
              <Link
                key={tab.label}
                href={href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Dispute Cards */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-12 text-center text-white/40">
                No disputes found
              </CardContent>
            </Card>
          ) : filtered.map(dispute => {
            const job = dispute.jobs;
            const daysOpen = getDaysOpen(dispute.created_at);
            const reasonTruncated = dispute.reason?.length > 120
              ? dispute.reason.slice(0, 120) + "..."
              : dispute.reason ?? "—";

            return (
              <Link key={dispute.id} href={`/admin/disputes/${dispute.id}`}>
                <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-xl flex-shrink-0 mt-0.5">
                          {job ? (SERVICE_CATEGORY_ICONS[job.category as ServiceCategory] ?? "🛠️") : "🛠️"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm">
                            {job?.title ?? "Unknown Job"}
                          </div>
                          <p className="text-xs text-white/50 mt-1 leading-relaxed">
                            {reasonTruncated}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-white/40">
                          {daysOpen === 0 ? "Today" : `${daysOpen}d open`}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusBadgeColor(dispute.status)}`}>
                          {dispute.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-white/30 mt-2 ml-9">
                      Opened {formatDateTime(dispute.created_at)}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
