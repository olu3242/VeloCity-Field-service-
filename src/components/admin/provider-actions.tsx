"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const DEFAULT_REJECT_REASON = "Application does not meet requirements";

export function ProviderApprovalActions({ providerId }: { providerId: string }) {
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
    const res = await fetch(`/api/providers/${providerId}/status`, {
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
      <div className="space-y-2">
        <textarea
          className="w-full rounded border border-white/20 bg-gray-800 text-white p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-velocity-500"
          rows={2}
          placeholder="Reason for rejection..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-7 text-xs bg-red-600 hover:bg-red-700"
            disabled={!!loading}
            onClick={() => act("reject", rejectReason || DEFAULT_REJECT_REASON)}
          >
            {loading === "reject" ? "..." : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-white/20 text-white/60"
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
    <div className="space-y-1">
      {error && <p className="text-xs text-red-500 mb-1">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" disabled={!!loading} onClick={() => act("approve")}>
          {loading === "approve" ? "..." : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-white/20 text-white/60"
          disabled={!!loading}
          onClick={() => setShowRejectForm(true)}
        >
          {loading === "reject" ? "..." : "Reject"}
        </Button>
      </div>
    </div>
  );
}
