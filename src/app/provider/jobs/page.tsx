import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { Job, JobStatus } from "@/types";

const ALL_STATUSES: JobStatus[] = [
  "accepted",
  "scheduled",
  "deposit_paid",
  "en_route",
  "arrived",
  "diagnosis_in_progress",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function ProviderJobsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "provider") redirect("/dashboard");

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!provider) redirect("/provider/apply");

  const params = await searchParams;
  const statusFilter = params.status as JobStatus | undefined;

  let query = supabase
    .from("jobs")
    .select("*, profiles!jobs_customer_id_fkey(full_name, email)")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: jobs } = await query;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-bold text-xl text-[#CCFF00]">
            ⚡ VeloCity
          </Link>
          <div className="flex items-center gap-1 text-xs">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400">Provider</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/60">{profile?.full_name}</span>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" asChild>
            <Link href="/provider/dashboard">← Dashboard</Link>
          </Button>
          <h1 className="text-2xl font-bold">My Jobs</h1>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/provider/jobs"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !statusFilter
                ? "bg-[#CCFF00] text-gray-900"
                : "border border-white/20 text-white/70 hover:border-[#CCFF00]/50"
            }`}
          >
            All
          </Link>
          {ALL_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/provider/jobs?status=${s}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-[#CCFF00] text-gray-900"
                  : "border border-white/20 text-white/70 hover:border-[#CCFF00]/50"
              }`}
            >
              {JOB_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>

        {/* Job list */}
        {!jobs?.length ? (
          <EmptyState
            variant="dark"
            icon="📋"
            title="No jobs found"
            description={
              statusFilter
                ? `You have no jobs with status "${JOB_STATUS_LABELS[statusFilter]}".`
                : "Make sure you're online to start receiving job offers in your area."
            }
            action={
              statusFilter
                ? { label: "View all jobs", href: "/provider/jobs" }
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((job: Job & { profiles?: { full_name?: string; email?: string } | null }) => (
              <Link key={job.id} href={`/provider/jobs/${job.id}`}>
                <Card className="border-white/10 bg-white/5 hover:border-[#CCFF00]/40 transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-3xl flex-shrink-0">
                          {SERVICE_CATEGORY_ICONS[job.category]}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-white truncate">
                            {job.title}
                          </div>
                          {job.profiles?.full_name && (
                            <div className="text-xs text-white/50 mt-0.5">
                              Customer: {job.profiles.full_name}
                            </div>
                          )}
                          <div className="text-sm text-white/50 mt-0.5">
                            {formatDateTime(job.scheduled_start ?? job.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {(job.final_cost_cents ?? job.quoted_cost_cents) ? (
                          <span className="font-semibold text-green-400">
                            {formatCents(
                              job.final_cost_cents ?? job.quoted_cost_cents ?? 0
                            )}
                          </span>
                        ) : null}
                        <Badge className={JOB_STATUS_COLORS[job.status]}>
                          {JOB_STATUS_LABELS[job.status]}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
