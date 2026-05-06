import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "@/components/jobs/review-form";
import { JOB_STATUS_LABELS, formatCents } from "@/lib/utils";
import type { JobStatus } from "@/types";

export default async function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("role, tenant_id").eq("id", user.id).single();
  if (profile?.role !== "customer") redirect("/dashboard");
  const tenantId = getTenantId(profile);

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("customer_id", user.id)
    .eq("tenant_id", tenantId)
    .single();

  if (!job) redirect("/dashboard");

  const { data: review } = await supabase
    .from("reviews")
    .select("*")
    .eq("job_id", id)
    .eq("reviewer_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const canReview = ["completed", "customer_confirmed", "closed"].includes(job.status);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review Job</h1>
          <p className="text-sm text-gray-500">{job.title}</p>
        </div>
        <Button asChild variant="outline"><Link href={`/dashboard/jobs/${job.id}`}>Back to Job</Link></Button>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Job Summary</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <div className="text-gray-500">Status</div>
            <Badge variant="secondary">{JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}</Badge>
          </div>
          <div>
            <div className="text-gray-500">Category</div>
            <div className="font-medium">{job.category}</div>
          </div>
          <div>
            <div className="text-gray-500">Final Price</div>
            <div className="font-medium">{formatCents(job.final_cost_cents ?? job.quoted_cost_cents ?? 0)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{review ? "Review Submitted" : "Your Review"}</CardTitle></CardHeader>
        <CardContent>
          {review ? (
            <div className="space-y-2 text-sm">
              <div className="font-medium">{review.rating} stars</div>
              <p className="text-gray-600">{review.comment ?? "No comment provided."}</p>
            </div>
          ) : canReview ? (
            <ReviewForm jobId={job.id} />
          ) : (
            <p className="text-sm text-gray-500">This job must be completed before a review can be submitted.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
