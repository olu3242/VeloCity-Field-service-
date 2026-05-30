"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function useRealtimeNotificationCount(userId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !supabaseUrl || supabaseUrl.includes("placeholder") ||
      !supabaseAnonKey || supabaseAnonKey.includes("placeholder")
    ) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    // Initial count
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .then(({ count: c }) => setCount(c ?? 0));

    // Realtime subscription
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => {
        supabase
          .from("notifications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_read", false)
          .then(({ count: c }) => setCount(c ?? 0));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return count;
}
