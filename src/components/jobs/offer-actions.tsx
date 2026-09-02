"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const DEFAULT_PASS_REASON = "Not available at this time";

export function OfferActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function act(action: "accept" | "reject", reason?: string) {
    setLoading(action);
    setError(null);
    const body: Record<string, string> = { action };
    if (action === "reject") body.reason = reason || DEFAULT_PASS_REASON;
    const res = await fetch(`/api/offers/${offerId}`, {
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
          className="w-full rounded border border-gray-300 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-velocity-500"
          rows={2}
          placeholder="Reason for passing (optional)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={!!loading}
            onClick={() => act("reject", rejectReason || DEFAULT_PASS_REASON)}
          >
            {loading === "reject" ? "..." : "Confirm Pass"}
          </Button>
          <Button
            size="sm"
            variant="outline"
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
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!!loading} onClick={() => act("accept")}>
          {loading === "accept" ? "..." : "Accept"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!loading}
          onClick={() => setShowRejectForm(true)}
        >
          Pass
        </Button>
      </div>
    </div>
  );
}
