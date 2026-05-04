"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ProviderApprovalActions({ providerId }: { providerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setLoading(action);
    setError(null);
    const res = await fetch(`/api/providers/${providerId}/status`, {
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
          onClick={() => act("reject")}
        >
          {loading === "reject" ? "..." : "Reject"}
        </Button>
      </div>
    </div>
  );
}
