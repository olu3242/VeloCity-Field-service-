"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Job {
  id: string;
  title: string;
  category: string;
  final_cost_cents: number | null;
}

const DISPUTE_REASONS = [
  { value: "work_not_completed", label: "Work not completed" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "overcharge", label: "Overcharge / billing dispute" },
  { value: "no_show", label: "Provider no-show" },
  { value: "property_damage", label: "Property damage" },
  { value: "other", label: "Other" },
];

export function NewDisputeForm({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!jobId || !reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, reason, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Submission failed. Please try again.");
      } else {
        router.push(`/dashboard/disputes/${data.data.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="border-dashed">
        + File a New Dispute
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">File a Dispute</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Select job *</label>
            <select
              required
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-velocity-700"
            >
              <option value="">— choose a job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} ({j.category.replace(/_/g, " ")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Reason *</label>
            <select
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-velocity-700"
            >
              <option value="">— select reason —</option>
              {DISPUTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the issue in detail…"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-velocity-700 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={submitting || !jobId || !reason}>
              {submitting ? "Submitting…" : "Submit Dispute"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
