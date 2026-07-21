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
  "submitted",
  "awaiting_match",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function CustomerJobsPage({ searchParams }: PageProps) {
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

  if (
    profile?.role === "admin" ||
    profile?.role === "super_admin" ||
    profile?.role === "provider" ||
    profile?.role === "dispatcher" ||
    profile?.role === "franchise_owner"
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const statusFilter = params.status as JobStatus | undefined;

  let query = supabase
    .from("jobs")
    .select("*")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: jobs } = await query;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">
          ⚡ VeloCity
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Hi, {profile?.full_name?.split(" ")[0]}
          </span>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">← Back</Link>
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">My Jobs</h1>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href="/dashboard/jobs"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              !statusFilter
                ? "bg-velocity-700 text-white"
                : "bg-white border text-gray-600 hover:border-velocity-300"
            }`}
          >
            All
          </Link>
          {ALL_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/dashboard/jobs?status=${s}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? "bg-velocity-700 text-white"
                  : "bg-white border text-gray-600 hover:border-velocity-300"
              }`}
            >
              {JOB_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>

        {/* Job list */}
        {!jobs?.length ? (
          <EmptyState
            icon="🧰"
            title="No jobs found"
            description={
              statusFilter
                ? `You have no jobs with status "${JOB_STATUS_LABELS[statusFilter]}".`
                : "Book your first service and we'll match you with a verified local provider."
            }
            action={
              statusFilter
                ? { label: "View all jobs", href: "/dashboard/jobs" }
                : { label: "Book a Service", href: "/book" }
            }
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((job: Job) => (
              <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-3xl flex-shrink-0">
                          {SERVICE_CATEGORY_ICONS[job.category]}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">
                            {job.title}
                          </div>
                          <div className="text-sm text-gray-500 mt-0.5">
                            {job.city && job.state
                              ? `${job.city}, ${job.state} • `
                              : ""}
                            {formatDateTime(job.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {(job.final_cost_cents ?? job.quoted_cost_cents) ? (
                          <span className="font-semibold text-gray-900">
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
