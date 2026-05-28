"use client";

import { useState } from "react";

export function ReviewForm({ jobId, providerName }: { jobId: string; providerName: string }) {
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

  if (done) {
    return (
      <div className="py-12 text-center">
        <div className="mb-4 text-4xl">★</div>
        <h2 className="mb-2 text-xl font-bold">Thanks for your review!</h2>
        <a href={`/dashboard/jobs/${jobId}`} className="text-velocity-volt hover:underline">
          Back to job
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-velocity-muted">
        How was your experience with <strong className="text-velocity-white">{providerName}</strong>?
      </p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            type="button"
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="text-4xl text-velocity-amber transition-transform hover:scale-110"
          >
            {star <= (hover || rating) ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Tell us about your experience... (optional)"
        rows={4}
        maxLength={2000}
        className="velocity-input w-full resize-none rounded-velocity-lg border p-3 text-sm focus:outline-none"
      />
      <div className="text-right text-xs text-velocity-muted">{comment.length}/2000</div>
      <button
        type="submit"
        disabled={!rating || submitting}
        className="w-full rounded-velocity-sm bg-velocity-volt py-3 font-medium text-velocity-black disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </form>
  );
}
