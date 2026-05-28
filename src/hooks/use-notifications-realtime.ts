"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RuntimeNotification } from "@/lib/repositories/notifications";
import { mapNotification } from "@/lib/repositories/notifications";

export function useNotificationsRealtime(
  userId: string | undefined,
  onInsert: (notification: RuntimeNotification) => void
) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => onInsert(mapNotification(payload.new as Record<string, any>))
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onInsert, userId]);
}
