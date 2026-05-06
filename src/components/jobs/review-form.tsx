"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReviewForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submitReview() {
    setStatus("saving");
    setError(null);

    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, rating, comment }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Unable to submit review.");
      setStatus("error");
      return;
    }

    setStatus("saved");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700" htmlFor="rating">Rating</label>
        <select
          id="rating"
          value={rating}
          onChange={(event) => setRating(Number(event.target.value))}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          {[5, 4, 3, 2, 1].map((value) => (
            <option key={value} value={value}>{value} stars</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700" htmlFor="comment">Review</label>
        <textarea
          id="comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={5}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          placeholder="Share what went well and anything the provider should improve."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "saved" && <p className="text-sm text-green-700">Review submitted.</p>}
      <Button onClick={submitReview} disabled={status === "saving"}>
        {status === "saving" ? "Submitting..." : "Submit Review"}
      </Button>
    </div>
  );
}
