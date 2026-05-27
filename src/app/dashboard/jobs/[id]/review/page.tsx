"use client";

import { useState } from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function ReviewForm({ jobId, providerName }: { jobId: string; providerName: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setSubmitting(true);
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, rating, comment: comment || null }),
    });
    setDone(true);
  }

  if (done) return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">⭐</div>
      <h2 className="text-xl font-bold mb-2">Thanks for your review!</h2>
      <a href={`/dashboard/jobs/${jobId}`} className="text-velocity-600 hover:underline">Back to job</a>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-gray-600">How was your experience with <strong>{providerName}</strong>?</p>
      {/* Star rating */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            type="button"
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="text-4xl transition-transform hover:scale-110"
          >
            {star <= (hover || rating) ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Tell us about your experience... (optional)"
        rows={4}
        maxLength={2000}
        className="w-full rounded-lg border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-velocity-500"
      />
      <div className="text-xs text-gray-400 text-right">{comment.length}/2000</div>
      <button
        type="submit"
        disabled={!rating || submitting}
        className="w-full py-3 bg-velocity-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-velocity-700"
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </form>
  );
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
