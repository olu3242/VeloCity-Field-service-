import type { SupabaseClient } from "@supabase/supabase-js";

export type RuntimeNotification = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  job_id?: string;
  metadata?: unknown;
};

export function mapNotification(row: Record<string, any>): RuntimeNotification {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    read: row.is_read ?? row.read ?? false,
    created_at: row.created_at,
    job_id: row.job_id ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

export async function listNotifications(supabase: SupabaseClient, userId: string, limit: number) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, is_read, created_at, job_id, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data: (data ?? []).map(mapNotification), error };
}
