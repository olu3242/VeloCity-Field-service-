// Centralised environment validation — imported once at the top of any
// server-side entry point that needs env access. Throws at startup if any
// required variable is missing or malformed, so misconfigured deploys fail
// immediately rather than at the first user request.
//
// Client-side code: import only NEXT_PUBLIC_* vars (safe to bundle).
// Server-side code: import the full `env` object.

import { z } from "zod";

const serverSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required"),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  // Cron auth
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),

  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // External services — optional; features degrade gracefully when absent
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof serverSchema>;

function validateEnv(): Env {
  // In client-side bundles (browser), skip validation entirely — the
  // NEXT_PUBLIC_* vars are inlined at build time and server-only vars
  // are undefined. The server components that call this will always run
  // on Node.js.
  if (typeof window !== "undefined") {
    return process.env as unknown as Env;
  }

  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `\n\n🚨 ENVIRONMENT VALIDATION FAILED — startup aborted.\n` +
      `The following environment variables are missing or invalid:\n${missing}\n\n` +
      `Check your .env.local / deployment environment configuration.\n`
    );
  }
  return result.data;
}

// Validate once at module-load time.
// The assignment throws if validation fails, killing the process before
// any request is served.
export const env: Env = validateEnv();

// Convenience: check if an optional feature group is fully configured.
export function isFeatureConfigured(feature: "twilio" | "sendgrid" | "google-maps" | "google-oauth"): boolean {
  switch (feature) {
    case "twilio":
      return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER);
    case "sendgrid":
      return !!env.SENDGRID_API_KEY;
    case "google-maps":
      return !!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    case "google-oauth":
      return !!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
    default:
      return false;
  }
}
