"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { apiFetch, apiPatch } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { useNotificationsRealtime } from "@/hooks/use-notifications-realtime";

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  job_id?: string;
}

const TYPE_ICONS: Record<string, string> = {
  job_update: "✅",
  provider_matched: "👷",
  quote_ready: "💰",
  payment_captured: "💳",
  dispute_opened: "⚠️",
  tip_received: "💝",
  review_nudge: "⭐",
  sla_breach: "🚨",
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [userId, setUserId] = useState<string>();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    setNotifications(await apiFetch<Notification[]>("/api/notifications?limit=10"));
  }

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const handleRealtimeInsert = useCallback((notification: Notification) => {
    setNotifications((current) => {
      if (current.some((item) => item.id === notification.id)) return current;
      return [notification, ...current].slice(0, 20);
    });
  }, []);

  useNotificationsRealtime(userId, handleRealtimeInsert);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unread = notifications.filter(n => !n.read).length;

  async function markAllRead() {
    await apiPatch("/api/notifications", { mark_all_read: true });
    setNotifications(n => n.map(x => ({ ...x, read: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-full hover:bg-white/10 transition-colors"
      >
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-80 rounded-xl border border-white/10 bg-gray-900 shadow-2xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="font-semibold text-sm text-white">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-velocity-400 hover:text-velocity-300"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-white/40">No notifications</div>
            ) : notifications.map(n => (
              <div
                key={n.id}
                className={`px-4 py-3 text-sm flex gap-3 items-start cursor-pointer hover:bg-white/5 ${!n.read ? "bg-white/[0.03]" : ""}`}
                onClick={() => {
                  if (n.job_id) window.location.href = `/dashboard/jobs/${n.job_id}`;
                  setOpen(false);
                }}
              >
                <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug ${!n.read ? "text-white" : "text-white/60"}`}>{n.message}</p>
                  <p className="text-[10px] text-white/30 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                {!n.read && <div className="h-2 w-2 rounded-full bg-velocity-400 flex-shrink-0 mt-1" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
