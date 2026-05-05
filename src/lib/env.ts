const PLACEHOLDER_VALUES = ["placeholder", "your-", "pk_test_...", "sk_test_...", "whsec_..."];

export type EnvKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "ANTHROPIC_API_KEY"
  | "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
  | "GOOGLE_OAUTH_CLIENT_ID"
  | "GOOGLE_OAUTH_CLIENT_SECRET"
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "TWILIO_PHONE_NUMBER"
  | "SENDGRID_API_KEY"
  | "NEXT_PUBLIC_APP_URL"
  | "CRON_SECRET"
  | "NEXTAUTH_SECRET";

export const ENV_DESCRIPTIONS: Record<EnvKey, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase project URL used by browser and server clients.",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase anon key used by browser and RLS-protected server requests.",
  SUPABASE_SERVICE_ROLE_KEY: "Server-only Supabase service role key for admin jobs and webhooks.",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "Stripe publishable key for browser payment collection.",
  STRIPE_SECRET_KEY: "Server-only Stripe secret key for payment intents, refunds, and transfers.",
  STRIPE_WEBHOOK_SECRET: "Stripe webhook signing secret for /api/webhooks/stripe.",
  ANTHROPIC_API_KEY: "Server-only Anthropic key used by the AI agent layer.",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "Google Maps browser key for maps, geocoding, and routing UI.",
  GOOGLE_OAUTH_CLIENT_ID: "Google OAuth client ID for Supabase/Auth provider setup.",
  GOOGLE_OAUTH_CLIENT_SECRET: "Google OAuth secret for server-side auth provider setup.",
  TWILIO_ACCOUNT_SID: "Twilio account SID for SMS notifications.",
  TWILIO_AUTH_TOKEN: "Twilio auth token for SMS notifications.",
  TWILIO_PHONE_NUMBER: "Twilio sender phone number for SMS notifications.",
  SENDGRID_API_KEY: "SendGrid API key for transactional email notifications.",
  NEXT_PUBLIC_APP_URL: "Canonical app URL used for redirects and webhooks.",
  CRON_SECRET: "Server-only shared secret used to protect scheduled cron routes.",
  NEXTAUTH_SECRET: "Auth secret used by NextAuth-compatible flows; at least 32 characters.",
};

export const REQUIRED_ENV_BY_AREA: Record<string, EnvKey[]> = {
  core: ["NEXT_PUBLIC_APP_URL"],
  supabase: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  adminSupabase: ["SUPABASE_SERVICE_ROLE_KEY"],
  stripe: ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  ai: ["ANTHROPIC_API_KEY"],
  maps: ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"],
  oauth: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "NEXTAUTH_SECRET"],
  sms: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
  email: ["SENDGRID_API_KEY"],
  cron: ["CRON_SECRET"],
};

export function isConfiguredValue(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return !PLACEHOLDER_VALUES.some((placeholder) => normalized.includes(placeholder));
}

export function hasEnv(key: EnvKey): boolean {
  return isConfiguredValue(process.env[key]);
}

export function getEnv(key: EnvKey): string | undefined {
  const value = process.env[key];
  return isConfiguredValue(value) ? value : undefined;
}

export function requireEnv(key: EnvKey): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function hasEnvGroup(group: keyof typeof REQUIRED_ENV_BY_AREA): boolean {
  return REQUIRED_ENV_BY_AREA[group].every(hasEnv);
}

export function getEnvStatus() {
  return Object.fromEntries(
    Object.entries(REQUIRED_ENV_BY_AREA).map(([area, keys]) => [
      area,
      {
        configured: keys.filter(hasEnv),
        missing: keys.filter((key) => !hasEnv(key)),
      },
    ])
  );
}
