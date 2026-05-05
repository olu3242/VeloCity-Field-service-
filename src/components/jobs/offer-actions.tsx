"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OfferActions({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    setLoading(action);
    setError(null);
    const res = await fetch(`/api/offers/${offerId}`, {
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
      {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!!loading} onClick={() => act("accept")}>
          {loading === "accept" ? "..." : "Accept"}
        </Button>
        <Button size="sm" variant="outline" disabled={!!loading} onClick={() => act("reject")}>
          {loading === "reject" ? "..." : "Pass"}
        </Button>
      </div>
    </div>
  );
}
