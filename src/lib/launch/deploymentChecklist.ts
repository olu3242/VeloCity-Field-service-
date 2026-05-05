import type { LaunchChecklistItem } from "./types";

export interface DeploymentStatusInput {
  supabaseLinked: boolean;
  migrationsAligned: boolean;
  rlsAudited: boolean;
  vercelConfigured: boolean;
  domainConfigured: boolean;
}

export function buildDeploymentChecklist(input: DeploymentStatusInput): LaunchChecklistItem[] {
  return [
    {
      id: "deploy-supabase-linked",
      label: "Supabase project linked",
      status: input.supabaseLinked ? "pass" : "blocked",
      evidence: input.supabaseLinked ? "Supabase CLI is linked to a project ref." : "Supabase project is not linked.",
      owner: "engineering",
      auditEvent: "launch.deploy.supabase_linked",
      required: true,
    },
    {
      id: "deploy-migrations",
      label: "Supabase migrations aligned",
      status: input.migrationsAligned ? "pass" : "blocked",
      evidence: input.migrationsAligned ? "Local and remote migration history are aligned." : "Remote migration history does not match local repo.",
      owner: "engineering",
      auditEvent: "launch.deploy.migrations",
      required: true,
    },
    {
      id: "deploy-rls",
      label: "RLS and security policies audited",
      status: input.rlsAudited ? "pass" : "warning",
      evidence: input.rlsAudited ? "RLS audit completed." : "RLS audit requires verification on the target Supabase project.",
      owner: "security",
      auditEvent: "launch.deploy.rls",
      required: true,
    },
    {
      id: "deploy-vercel",
      label: "Vercel project configured",
      status: input.vercelConfigured ? "pass" : "warning",
      evidence: input.vercelConfigured ? "Vercel env and build settings are configured." : "Vercel deployment settings still need verification.",
      owner: "engineering",
      auditEvent: "launch.deploy.vercel",
      required: true,
    },
    {
      id: "deploy-domain",
      label: "Production domain and OAuth redirects configured",
      status: input.domainConfigured ? "pass" : "warning",
      evidence: input.domainConfigured ? "Production domain and redirects verified." : "Production domain and OAuth redirect allowlist not verified.",
      owner: "engineering",
      auditEvent: "launch.deploy.domain",
      required: true,
    },
  ];
}
