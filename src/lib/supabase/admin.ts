// Cookie-free Supabase admin client for automation/cron contexts
// Uses service_role key — NEVER expose to the browser
// Intentionally untyped (no Database generic) because automation tables
// are not yet in the generated types and we can't run supabase gen types
// against placeholder credentials.
import { createClient } from "@supabase/supabase-js";

type AdminClient = ReturnType<typeof createClient<any>>;

let _adminClient: AdminClient | null = null;

export function getAdminClient(): AdminClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || url.includes("placeholder") || key.includes("placeholder")) {
    throw new Error("Supabase service role credentials not configured");
  }

  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _adminClient;
}
