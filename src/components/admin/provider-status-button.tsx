"use client";

import { useState } from "react";

export function ProviderStatusButton({ providerId, currentStatus }: { providerId: string; currentStatus: string }) {
  const [loading, setLoading] = useState(false);
  async function handleClick() {
    setLoading(true);
    const newStatus = currentStatus === "approved" ? "suspended" : "approved";
    await fetch(`/api/providers/${providerId}/status`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ status: newStatus }) });
    window.location.reload();
  }
  if (currentStatus === "pending") return null;
  return (
    <button onClick={handleClick} disabled={loading}
      className={`w-full py-2 px-4 rounded text-sm font-medium ${currentStatus === "approved" ? "bg-red-900 hover:bg-red-800 text-red-100" : "bg-green-900 hover:bg-green-800 text-green-100"}`}>
      {loading ? "..." : currentStatus === "approved" ? "Suspend Provider" : "Re-activate Provider"}
    </button>
  );
}
