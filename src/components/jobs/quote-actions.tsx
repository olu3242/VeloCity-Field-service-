"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setLoading(action);
    setError(null);
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed");
      setLoading(null);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button className="flex-1" disabled={!!loading} onClick={() => act("approve")}>
          {loading === "approve" ? "Approving..." : "Approve Quote"}
        </Button>
        <Button variant="outline" className="flex-1" disabled={!!loading} onClick={() => act("reject")}>
          {loading === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
    </div>
  );
}
