import { env, getEnv, getRuntimeWarning, isConfiguredValue } from "@/config/env";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

export function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!isConfiguredValue(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log("SUPABASE URL:", url);
  console.log(
    "SUPABASE ANON:",
    anonKey ? `PRESENT (${anonKey.length} chars)` : "MISSING"
  );

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function requireSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  }
  return config;
}

export function getAppUrl(origin?: string) {
  return getEnv("NEXT_PUBLIC_APP_URL") ?? origin ?? env.appUrl;
}

export function warnMissingSupabaseConfig() {
  const warning = getRuntimeWarning("Supabase is not configured. Local UI will render with disabled runtime clients.");
  if (warning) console.warn(warning);
}
