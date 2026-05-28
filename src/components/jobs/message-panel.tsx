"use client";

import { useCallback, useState } from "react";
import { apiPost } from "@/lib/api/client";
import { useJobMessagesRealtime, type LiveJobMessage } from "@/hooks/use-job-messages-realtime";
import { Button } from "@/components/ui/button";

export function MessagePanel({ jobId, messages }: { jobId: string; messages: Array<{ id: string; sender_role: string; message: string; created_at: string }> }) {
  const [items, setItems] = useState(messages);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRealtimeInsert = useCallback((item: LiveJobMessage) => {
    setItems((current) => {
      if (current.some((existing) => existing.id === item.id)) return current;
      return [...current, item];
    });
  }, []);

  useJobMessagesRealtime(jobId, handleRealtimeInsert);

  async function send() {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const created = await apiPost<LiveJobMessage>(`/api/jobs/${jobId}/messages`, { message });
      setItems((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="rounded-velocity-md border border-velocity-border bg-velocity-slate/50 p-3 text-sm">
            <div className="font-mono text-xs font-medium uppercase tracking-[0.08em] text-velocity-muted">{item.sender_role}</div>
            <p>{item.message}</p>
          </div>
        ))}
        {!items.length && <p className="text-sm text-velocity-muted">No messages yet.</p>}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="velocity-input w-full rounded-velocity-md border px-3 py-2 text-sm" rows={3} placeholder="Send a job message..." />
      <Button onClick={send} disabled={sending}>{sending ? "Sending..." : "Send Message"}</Button>
    </div>
  );
}
