import type { LaunchChecklistItem } from "./types";

export interface EnvironmentStatusInput {
  coreConfigured: boolean;
  supabaseConfigured: boolean;
  adminSupabaseConfigured: boolean;
  stripeConfigured: boolean;
  aiConfigured: boolean;
  googleConfigured: boolean;
  smsConfigured: boolean;
  emailConfigured: boolean;
}

export function buildEnvironmentChecklist(input: EnvironmentStatusInput): LaunchChecklistItem[] {
  return [
    {
      id: "env-core",
      label: "Core app URL configured",
      status: input.coreConfigured ? "pass" : "blocked",
      evidence: input.coreConfigured ? "NEXT_PUBLIC_APP_URL is configured." : "NEXT_PUBLIC_APP_URL is missing.",
      owner: "engineering",
      auditEvent: "launch.env.core",
      required: true,
    },
    {
      id: "env-supabase",
      label: "Supabase browser/server keys configured",
      status: input.supabaseConfigured && input.adminSupabaseConfigured ? "pass" : "blocked",
      evidence: input.supabaseConfigured && input.adminSupabaseConfigured ? "Supabase URL, anon key, and service role key detected." : "Supabase credentials are incomplete.",
      owner: "engineering",
      auditEvent: "launch.env.supabase",
      required: true,
    },
    {
      id: "env-stripe",
      label: "Stripe payment credentials configured",
      status: input.stripeConfigured ? "pass" : "warning",
      evidence: input.stripeConfigured ? "Stripe publishable, secret, and webhook values detected." : "Stripe is missing; local payment fallback may be active.",
      owner: "finance",
      auditEvent: "launch.env.stripe",
      required: true,
    },
    {
      id: "env-ai",
      label: "Anthropic AI key configured",
      status: input.aiConfigured ? "pass" : "warning",
      evidence: input.aiConfigured ? "AI key detected." : "AI agents will use deterministic fallbacks.",
      owner: "ai",
      auditEvent: "launch.env.ai",
      required: false,
    },
    {
      id: "env-google",
      label: "Google OAuth configured",
      status: input.googleConfigured ? "pass" : "warning",
      evidence: input.googleConfigured ? "Google OAuth values detected." : "Google OAuth values are incomplete.",
      owner: "engineering",
      auditEvent: "launch.env.google",
      required: false,
    },
    {
      id: "env-notifications",
      label: "External notification providers configured",
      status: input.smsConfigured && input.emailConfigured ? "pass" : "warning",
      evidence: input.smsConfigured && input.emailConfigured ? "Twilio and SendGrid values detected." : "In-app notification fallback may be used.",
      owner: "ops",
      auditEvent: "launch.env.notifications",
      required: false,
    },
  ];
}
