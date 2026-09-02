"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const DEFAULT_REJECT_REASON = "Quote does not meet my requirements";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function act(action: "approve" | "reject", reason?: string) {
    setLoading(action);
    setError(null);
    const body: Record<string, string> = { action };
    if (action === "reject") body.reason = reason || DEFAULT_REJECT_REASON;
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed");
      setLoading(null);
      return;
    }
    router.refresh();
  }

  if (showRejectForm) {
    return (
      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium text-gray-700">Why are you rejecting this quote?</p>
        <textarea
          className="w-full rounded-md border border-gray-300 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-velocity-500"
          rows={3}
          placeholder="e.g. Price too high, timeline doesn't work..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Button
            variant="destructive"
            className="flex-1"
            disabled={!!loading}
            onClick={() => act("reject", rejectReason || DEFAULT_REJECT_REASON)}
          >
            {loading === "reject" ? "Rejecting..." : "Confirm Rejection"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={!!loading}
            onClick={() => { setShowRejectForm(false); setRejectReason(""); setError(null); }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button className="flex-1" disabled={!!loading} onClick={() => act("approve")}>
          {loading === "approve" ? "Approving..." : "Approve Quote"}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          disabled={!!loading}
          onClick={() => setShowRejectForm(true)}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
