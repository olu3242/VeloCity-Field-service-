// Cookie-free Supabase admin client for automation/cron contexts
// Uses service_role key — NEVER expose to the browser
// Intentionally untyped (no Database generic) because automation tables
// are not yet in the generated types and we can't run supabase gen types
// against placeholder credentials.
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

type AdminClient = ReturnType<typeof createClient<any>>;

let _adminClient: AdminClient | null = null;

export function getAdminClient(): AdminClient {
  if (_adminClient) return _adminClient;

  const url = env.supabase.url;
  const key = env.supabase.serviceRoleKey;

  if (!url || !key) {
    throw new Error("Supabase service role credentials not configured");
  }

  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _adminClient;
}
