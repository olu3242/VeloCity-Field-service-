"use client";

import { useState } from "react";

export function ReviewFormEnhanced({ jobId, providerName }: { jobId: string; providerName: string }) {
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
