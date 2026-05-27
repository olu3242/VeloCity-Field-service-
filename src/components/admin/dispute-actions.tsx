"use client";

import { useState } from "react";

export function DisputeActions({ disputeId, jobId }: { disputeId: string; jobId: string }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function resolve(resolution: string) {
    setLoading(true);
    await fetch(`/api/disputes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispute_id: disputeId, resolution, note }),
    });
    window.location.reload();
  }

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Admin notes..."
        rows={3}
        className="w-full rounded bg-white/5 border border-white/10 text-sm p-2 text-white placeholder:text-white/30"
      />
      <button
        onClick={() => resolve("refund_customer")}
        disabled={loading}
        className="w-full py-2 bg-blue-900 hover:bg-blue-800 text-blue-100 rounded text-sm disabled:opacity-50"
      >
        Refund Customer
      </button>
      <button
        onClick={() => resolve("release_to_provider")}
        disabled={loading}
        className="w-full py-2 bg-green-900 hover:bg-green-800 text-green-100 rounded text-sm disabled:opacity-50"
      >
        Release to Provider
      </button>
      <button
        onClick={() => resolve("escalated")}
        disabled={loading}
        className="w-full py-2 bg-yellow-900 hover:bg-yellow-800 text-yellow-100 rounded text-sm disabled:opacity-50"
      >
        Escalate
      </button>
    </div>
  );
}
