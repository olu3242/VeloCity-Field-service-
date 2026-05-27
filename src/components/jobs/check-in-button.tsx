"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CheckInButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function checkIn() {
    setStatus("loading");
    setMessage(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const response = await fetch(`/api/jobs/${jobId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setMessage(body?.error ?? "Check-in failed.");
        return;
      }
      setStatus("idle");
      setMessage("Arrival verified.");
      router.refresh();
    }, () => {
      setStatus("error");
      setMessage("Location permission is required for arrival check-in.");
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={checkIn} disabled={status === "loading"}>{status === "loading" ? "Checking..." : "Verify Arrival"}</Button>
      {message && <p className={`text-xs ${status === "error" ? "text-red-600" : "text-green-700"}`}>{message}</p>}
    </div>
  );
}
