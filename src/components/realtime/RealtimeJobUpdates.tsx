"use client";
import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

/**
 * Invisible component — subscribes to realtime job changes for the current user
 * and triggers router.refresh() to re-render server components with fresh data.
 * Drop into any portal layout that needs live job updates.
 */
export function RealtimeJobUpdates({
  userId,
  filter,
}: {
  userId: string;
  filter?: "customer_id" | "provider_id";
}) {
  const router = useRouter();

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (
      !supabaseUrl || supabaseUrl.includes("placeholder") ||
      !supabaseAnonKey || supabaseAnonKey.includes("placeholder")
    ) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    const channelName = `jobs-${filter ?? "all"}-${userId}`;
    const channelFilter = filter
      ? `${filter}=eq.${userId}`
      : undefined;

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "jobs",
        ...(channelFilter ? { filter: channelFilter } : {}),
      }, () => {
        router.refresh();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, filter, router]);

  return null;
}
