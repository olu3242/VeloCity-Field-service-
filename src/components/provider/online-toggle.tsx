"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OnlineToggle({ providerId, isOnline }: { providerId: string; isOnline: boolean }) {
  const router = useRouter();
  const [online, setOnline] = useState(isOnline);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/providers/${providerId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_online" }),
    });
    if (res.ok) {
      const d = await res.json();
      setOnline(d.is_online);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      <div className={`h-2.5 w-2.5 rounded-full transition-colors ${online ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
      <span className={online ? "text-green-700 font-medium" : "text-gray-500"}>
        {loading ? "..." : online ? "Online" : "Go Online"}
      </span>
    </button>
  );
}
