"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useJobRealtime(jobId: string, onChange: () => void) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`,
        },
        onChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [jobId, onChange]);
}
