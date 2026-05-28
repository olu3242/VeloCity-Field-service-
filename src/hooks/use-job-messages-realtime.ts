"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export type LiveJobMessage = {
  id: string;
  sender_role: string;
  message: string;
  created_at: string;
};

export function useJobMessagesRealtime(
  jobId: string,
  onInsert: (message: LiveJobMessage) => void
) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job_messages:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_messages",
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => onInsert(payload.new as LiveJobMessage)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, onInsert]);
}
