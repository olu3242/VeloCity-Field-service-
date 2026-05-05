import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
  SERVICE_CATEGORY_ICONS,
  URGENCY_LABELS,
  formatCents,
  formatDateTime,
} from "@/lib/utils";
import type { Job } from "@/types";

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const page = parseInt(sp.page ?? "1");
  const pageSize = 25;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("jobs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (sp.status) query = query.eq("status", sp.status);

  const { data: jobs, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  const STATUS_FILTERS = [
    "submitted", "awaiting_match", "offer_sent", "accepted",
    "in_progress", "completed", "disputed", "cancelled",
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center gap-6">
        <Link href="/admin/dashboard" className="font-bold text-velocity-300">⚡ Admin</Link>
        <span className="text-white/30">/</span>
        <span className="text-white/70">Jobs</span>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">All Jobs <span className="text-white/40 text-lg">({count ?? 0})</span></h1>
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link href="/admin/jobs">
            <span className={`px-3 py-1 rounded-full text-xs border cursor-pointer transition-colors ${!sp.status ? "bg-velocity-600 border-velocity-600" : "border-white/20 text-white/50 hover:border-white/50"}`}>
              All
            </span>
          </Link>
          {STATUS_FILTERS.map((s) => (
            <Link key={s} href={`/admin/jobs?status=${s}`}>
              <span className={`px-3 py-1 rounded-full text-xs border cursor-pointer transition-colors ${sp.status === s ? "bg-velocity-600 border-velocity-600" : "border-white/20 text-white/50 hover:border-white/50"}`}>
                {JOB_STATUS_LABELS[s as Job["status"]]}
              </span>
            </Link>
          ))}
        </div>

        {/* Jobs table */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Job</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Urgency</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs?.map((job: Job) => (
                <tr key={job.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{SERVICE_CATEGORY_ICONS[job.category]}</span>
                      <span className="font-medium truncate max-w-[180px]">{job.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/60 truncate max-w-[120px]">
                    {job.city}, {job.state}
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">
                    {URGENCY_LABELS[job.urgency].split(" (")[0]}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={JOB_STATUS_COLORS[job.status]}>
                      {JOB_STATUS_LABELS[job.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {job.quoted_cost_cents ? formatCents(job.quoted_cost_cents) : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {formatDateTime(job.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/jobs/${job.id}`}>
                      <span className="text-velocity-400 hover:underline text-xs">View →</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {!jobs?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/30">
                    No jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-white/50">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/admin/jobs?page=${page - 1}${sp.status ? `&status=${sp.status}` : ""}`}>
                  <Button variant="outline" size="sm" className="border-white/20 text-white/60">← Prev</Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/admin/jobs?page=${page + 1}${sp.status ? `&status=${sp.status}` : ""}`}>
                  <Button variant="outline" size="sm" className="border-white/20 text-white/60">Next →</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
