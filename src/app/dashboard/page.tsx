import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { Job } from "@/types";

export default async function CustomerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") redirect("/admin/dashboard");
  if (profile?.role === "provider") redirect("/provider/dashboard");

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const activeJobs = jobs?.filter((j) =>
    !["completed", "closed", "cancelled", "expired", "refunded"].includes(j.status)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Hi, {profile?.full_name?.split(" ")[0]}</span>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">My Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-velocity-700">{activeJobs?.length ?? 0}</div>
              <div className="text-sm text-gray-500 mt-1">Active Jobs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-gray-900">
                {jobs?.filter((j) => j.status === "completed").length ?? 0}
              </div>
              <div className="text-sm text-gray-500 mt-1">Completed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-gray-900">
                {formatCents(
                  jobs?.reduce((sum, j) => sum + (j.final_cost_cents ?? j.quoted_cost_cents ?? 0), 0) ?? 0
                )}
              </div>
              <div className="text-sm text-gray-500 mt-1">Total Spent</div>
            </CardContent>
          </Card>
        </div>

        {/* Active Jobs */}
        {activeJobs && activeJobs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>
            <div className="space-y-3">
              {activeJobs.map((job: Job) => (
                <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-3xl">{SERVICE_CATEGORY_ICONS[job.category]}</span>
                        <div>
                          <div className="font-medium">{job.title}</div>
                          <div className="text-sm text-gray-500">
                            {job.city}, {job.state} • {formatDateTime(job.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {job.quoted_cost_cents && (
                          <span className="font-semibold">{formatCents(job.quoted_cost_cents)}</span>
                        )}
                        <Badge className={JOB_STATUS_COLORS[job.status]}>
                          {JOB_STATUS_LABELS[job.status]}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Jobs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All Jobs</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/jobs">View all</Link>
            </Button>
          </div>

          {!jobs?.length ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-gray-500 mb-4">No jobs yet. Book your first service!</p>
                <Button asChild>
                  <Link href="/book">Book a Service</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {jobs.map((job: Job) => (
                <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
                  <div className="flex items-center justify-between rounded-lg border bg-white p-4 hover:border-velocity-300 transition-colors">
                    <div className="flex items-center gap-3">
                      <span>{SERVICE_CATEGORY_ICONS[job.category]}</span>
                      <div>
                        <div className="font-medium text-sm">{job.title}</div>
                        <div className="text-xs text-gray-400">{formatDateTime(job.created_at)}</div>
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
