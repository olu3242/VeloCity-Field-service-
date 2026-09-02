"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Notification {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  message?: string;
  read: boolean;
  created_at: string;
  job_id?: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProviderNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=100");
      const json = await res.json();
      setNotifications(json.data ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    setMarking(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_all_read: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } finally {
      setMarking(false);
    }
  }

  async function markOneRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  useEffect(() => { load(); }, []);

  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-[#CCFF00]">⚡ VeloCity</Link>
        <div className="flex items-center gap-4">
          <Link href="/provider/dashboard" className="text-sm text-white/60 hover:text-white">Dashboard</Link>
          <Link href="/provider/jobs" className="text-sm text-white/60 hover:text-white">Jobs</Link>
          <Link href="/provider/earnings" className="text-sm text-white/60 hover:text-white">Earnings</Link>
          <Link href="/provider/skills" className="text-sm text-white/60 hover:text-white">Skills</Link>
          <span className="text-sm text-[#CCFF00]">Notifications</span>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            {unread.length > 0 && (
              <p className="text-white/40 text-sm mt-1">{unread.length} unread</p>
            )}
          </div>
          {unread.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={marking}
              className="border-white/20 text-white/60 hover:text-white"
            >
              {marking ? "Marking…" : "Mark all read"}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 text-white/30 text-sm">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-gray-900 py-16 text-center text-white/30 text-sm">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const headline = n.title ?? n.message ?? "Notification";
              const detail = n.body ?? "";
              return (
                <div
                  key={n.id}
                  className={`rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    n.read
                      ? "border-white/5 bg-gray-900/40 opacity-60"
                      : "border-white/20 bg-gray-900 shadow-sm"
                  }`}
                  onClick={() => !n.read && markOneRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-[#CCFF00] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${n.read ? "text-white/50" : "font-medium text-white"}`}>
                          {headline}
                        </p>
                        <span className="text-xs text-white/30 shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      {detail && <p className="text-xs text-white/40 mt-0.5">{detail}</p>}
                      {n.job_id && (
                        <Link
                          href={`/provider/jobs/${n.job_id}`}
                          className="text-xs text-[#CCFF00] hover:underline mt-1 inline-block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View job →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
