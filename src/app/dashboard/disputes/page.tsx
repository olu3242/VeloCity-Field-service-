import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { NewDisputeForm } from "./NewDisputeForm";

function statusBadge(s: string) {
  if (s === "open") return "bg-red-100 text-red-700";
  if (s === "under_review") return "bg-yellow-100 text-yellow-700";
  if (s === "resolved") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-500";
}

export default async function CustomerDisputesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin" || profile?.role === "super_admin") redirect("/admin/disputes");
  if (profile?.role === "provider") redirect("/provider/dashboard");

  const [{ data: disputeRows }, { data: completedJobs }] = await Promise.all([
    supabase
      .from("disputes")
      .select("id, status, reason, description, created_at, job_id, jobs!disputes_job_id_fkey(title, category)")
      .eq("initiated_by", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("jobs")
      .select("id, title, category, status, final_cost_cents")
      .eq("customer_id", user.id)
      .in("status", ["completed", "customer_confirmed", "disputed"])
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  type DisputeRow = {
    id: string; status: string; reason: string; description: string | null;
    created_at: string; job_id: string; jobs: { title: string; category: string } | null;
  };
  type JobRow = { id: string; title: string; category: string; status: string; final_cost_cents: number | null };

  const disputes = (disputeRows ?? []) as unknown as DisputeRow[];
  const jobs = (completedJobs ?? []) as JobRow[];

  // Jobs that don't already have a dispute filed
  const disputedJobIds = new Set(disputes.map((d) => d.job_id));
  const eligibleJobs = jobs.filter((j) => !disputedJobIds.has(j.id) && j.status !== "disputed");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
          <Link href="/dashboard/notifications" className="text-sm text-gray-500 hover:text-gray-900">Notifications</Link>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Disputes</h1>
        <p className="text-sm text-gray-500 mb-8">
          File a dispute for a completed job or track the status of an existing one.
        </p>

        {/* Open new dispute */}
        {eligibleJobs.length > 0 && (
          <NewDisputeForm jobs={eligibleJobs} />
        )}

        {/* Existing disputes */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
            My Disputes ({disputes.length})
          </h2>

          {disputes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center text-gray-400 text-sm">
              No disputes on file.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Job</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Reason</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-gray-500 font-medium">Filed</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {disputes.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate">
                        {d.jobs?.title ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize max-w-[180px] truncate">
                        {d.reason?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={statusBadge(d.status)}>
                          {d.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {formatDateTime(d.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/disputes/${d.id}`}
                          className="text-xs text-velocity-700 hover:underline"
                        >
                          Details →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
