import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewForm } from "./review-form-client";

interface ProviderInfo {
  business_name: string;
}

interface JobInfo {
  id: string;
  title: string;
  status: string;
  provider_id: string;
  providers: ProviderInfo | null;
}

interface ExistingReview {
  id: string;
  rating: number;
  comment: string | null;
}

export default async function CustomerReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: jobRaw } = await supabase
    .from("jobs")
    .select("id, title, status, provider_id, providers(business_name)")
    .eq("id", id)
    .eq("customer_id", user.id)
    .single();

  if (!jobRaw) notFound();

  const job = jobRaw as unknown as JobInfo;

  const REVIEWABLE = ["completed", "customer_confirmed", "closed"];
  if (!REVIEWABLE.includes(job.status as string)) redirect(`/dashboard/jobs/${id}`);

  const { data: existingReviewRaw } = await supabase
    .from("reviews")
    .select("id, rating, comment")
    .eq("job_id", id)
    .eq("customer_id", user.id)
    .maybeSingle();

  const existingReview = existingReviewRaw as unknown as ExistingReview | null;
  const providerName = job.providers?.business_name ?? "your provider";

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-lg">
        <Link href={`/dashboard/jobs/${id}`} className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
          ← Back to job
        </Link>
        <Card className="bg-white shadow-sm">
          <CardHeader>
            <CardTitle>{job.title}</CardTitle>
            <p className="text-sm text-gray-500">
              {existingReview ? "Your review" : `Leave a review for ${providerName}`}
            </p>
          </CardHeader>
          <CardContent>
            {existingReview ? (
              <div className="space-y-4">
                <div className="text-3xl text-yellow-400">
                  {"★".repeat(existingReview.rating)}{"☆".repeat(5 - existingReview.rating)}
                </div>
                {existingReview.comment && (
                  <p className="text-gray-600 italic">{existingReview.comment}</p>
                )}
                <p className="text-sm text-gray-400">You already reviewed this job.</p>
                <Link href={`/dashboard/jobs/${id}`} className="text-velocity-600 hover:underline text-sm">
                  Back to job →
                </Link>
              </div>
            ) : (
              <ReviewForm jobId={id} providerName={providerName} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
