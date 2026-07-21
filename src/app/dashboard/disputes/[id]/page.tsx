import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents, formatDateTime } from "@/lib/utils";

function statusBadge(s: string) {
  if (s === "open") return "bg-red-100 text-red-700";
  if (s === "under_review") return "bg-yellow-100 text-yellow-700";
  if (s === "resolved") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-500";
}

function statusLabel(s: string) {
  if (s === "open") return "Open — under initial review";
  if (s === "under_review") return "Under review by our team";
  if (s === "resolved") return "Resolved";
  if (s === "closed") return "Closed";
  return s.replace(/_/g, " ");
}

export default async function CustomerDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin" || profile?.role === "super_admin") redirect(`/admin/disputes/${id}`);
  if (profile?.role === "provider") redirect("/provider/dashboard");

  const { data: dispute } = await supabase
    .from("disputes")
    .select("id, status, reason, description, created_at, job_id, refund_amount_cents, resolution_notes, ai_recommendation, jobs!disputes_job_id_fkey(title, category, status, final_cost_cents)")
    .eq("id", id)
    .eq("initiated_by", user.id)
    .maybeSingle();

  if (!dispute) redirect("/dashboard/disputes");

  type Job = { title: string; category: string; status: string; final_cost_cents: number | null };
  const job = dispute.jobs as unknown as Job | null;

  const recommendation = dispute.ai_recommendation as Record<string, unknown> | null;
  const ivyOutcome = recommendation?.outcome as string | undefined;
  const ivyReasoning = recommendation?.reasoning as string | undefined;
  const ivySeverity = recommendation?.severity as string | undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-velocity-700">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
          <Link href="/dashboard/disputes" className="text-sm text-gray-500 hover:text-gray-900">Disputes</Link>
          <Button asChild>
            <Link href="/book">+ New Request</Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 capitalize">
              {dispute.reason.replace(/_/g, " ")}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Filed {formatDateTime(dispute.created_at)}
              {job ? ` · ${job.title}` : ""}
            </p>
          </div>
          <Badge className={statusBadge(dispute.status)}>{dispute.status.replace(/_/g, " ")}</Badge>
        </div>

        {/* Status timeline */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{statusLabel(dispute.status)}</p>
            {dispute.resolution_notes && (
              <div className="mt-3 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Resolution notes: </span>
                {dispute.resolution_notes}
              </div>
            )}
            {dispute.refund_amount_cents != null && dispute.refund_amount_cents > 0 && (
              <div className="mt-3 text-sm">
                <span className="text-gray-500">Refund amount: </span>
                <span className="font-semibold text-green-700">{formatCents(dispute.refund_amount_cents)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job details */}
        {job && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm">Related Job</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 text-xs mb-0.5">Title</div>
                  <div className="font-medium">{job.title}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-0.5">Category</div>
                  <div className="capitalize">{job.category.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-0.5">Job Status</div>
                  <div className="capitalize">{job.status.replace(/_/g, " ")}</div>
                </div>
                {job.final_cost_cents != null && (
                  <div>
                    <div className="text-gray-400 text-xs mb-0.5">Amount</div>
                    <div className="font-semibold">{formatCents(job.final_cost_cents)}</div>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <Link href={`/dashboard/jobs/${dispute.job_id}`} className="text-xs text-velocity-700 hover:underline">
                  View job details →
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        {dispute.description && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm">Your Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700">{dispute.description}</p>
            </CardContent>
          </Card>
        )}

        {/* IVY analysis */}
        {ivyReasoning && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm">Automated Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ivyOutcome && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Recommendation:</span>
                  <Badge className={ivyOutcome === "refund" ? "bg-green-100 text-green-700" : ivyOutcome === "reject" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}>
                    {ivyOutcome}
                  </Badge>
                  {ivySeverity && (
                    <Badge className="bg-gray-100 text-gray-500">severity: {ivySeverity}</Badge>
                  )}
                </div>
              )}
              <p className="text-sm text-gray-600">{ivyReasoning}</p>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/dashboard/disputes">← All Disputes</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
