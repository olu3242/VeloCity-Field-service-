import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/config/env";
import { createMissingSupabaseClient } from "@/lib/supabase/missing-config-client";
import { getSupabaseConfig, requireSupabaseConfig, warnMissingSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const config = env.isProduction
    ? requireSupabaseConfig()
    : getSupabaseConfig();

  if (!config) {
    warnMissingSupabaseConfig();
    return createMissingSupabaseClient() as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(
    config.url,
    config.anonKey,
    {
      auth: {
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
}
