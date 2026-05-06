import { createBrowserClient } from "@supabase/ssr";
import { createMissingSupabaseClient } from "@/lib/supabase/missing-config-client";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing required Supabase environment variables.");
    }
    return createMissingSupabaseClient() as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
}
