import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import WebSocket from "ws";
import { env, requireEnv } from "@/config/env";
import { getSupabaseConfig, requireSupabaseConfig, warnMissingSupabaseConfig } from "@/lib/supabase/config";
import { createMissingSupabaseClient } from "@/lib/supabase/missing-config-client";

export async function createClient() {
  const cookieStore = await cookies();
  const config = env.isProduction
    ? requireSupabaseConfig()
    : getSupabaseConfig();

  if (!config) {
    warnMissingSupabaseConfig();
    return createMissingSupabaseClient() as unknown as ReturnType<typeof createServerClient>;
  }

  return createServerClient(
    config.url,
    config.anonKey,
    {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

export async function createAdminClient() {
  const cookieStore = await cookies();
  const config = requireSupabaseConfig();

  return createServerClient(
    config.url,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
