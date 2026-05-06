"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MessagePanel({ jobId, messages }: { jobId: string; messages: Array<{ id: string; sender_role: string; message: string; created_at: string }> }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    const response = await fetch(`/api/jobs/${jobId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setSending(false);
    if (response.ok) {
      setMessage("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {messages.map((item) => (
          <div key={item.id} className="rounded-md border p-3 text-sm">
            <div className="text-xs font-medium text-gray-500">{item.sender_role}</div>
            <p>{item.message}</p>
          </div>
        ))}
        {!messages.length && <p className="text-sm text-gray-500">No messages yet.</p>}
      </div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" rows={3} placeholder="Send a job message..." />
      <Button onClick={send} disabled={sending}>{sending ? "Sending..." : "Send Message"}</Button>
    </div>
  );
}
