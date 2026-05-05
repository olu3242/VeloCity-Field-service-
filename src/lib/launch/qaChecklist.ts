import type { LaunchChecklistItem } from "./types";

export interface QaStatusInput {
  typecheckPassed: boolean;
  lintPassed: boolean;
  buildPassed: boolean;
  demoAccountsVerified: boolean;
  e2eCompleted: boolean;
}

export function buildQaChecklist(input: QaStatusInput): LaunchChecklistItem[] {
  return [
    {
      id: "qa-typecheck",
      label: "TypeScript validation",
      status: input.typecheckPassed ? "pass" : "fail",
      evidence: input.typecheckPassed ? "npm run type-check passed." : "Typecheck has not passed.",
      owner: "engineering",
      auditEvent: "launch.qa.typecheck",
      required: true,
    },
    {
      id: "qa-lint",
      label: "Lint validation",
      status: input.lintPassed ? "pass" : "warning",
      evidence: input.lintPassed ? "npm run lint passed with known image warning only." : "Lint status unknown or failed.",
      owner: "engineering",
      auditEvent: "launch.qa.lint",
      required: true,
    },
    {
      id: "qa-build",
      label: "Production build",
      status: input.buildPassed ? "pass" : "fail",
      evidence: input.buildPassed ? "npm run build passed." : "Production build has not passed.",
      owner: "engineering",
      auditEvent: "launch.qa.build",
      required: true,
    },
    {
      id: "qa-demo-accounts",
      label: "Demo account verification",
      status: input.demoAccountsVerified ? "pass" : "blocked",
      evidence: input.demoAccountsVerified ? "Demo customer/provider/admin accounts verified." : "Demo accounts cannot be verified until Supabase schema is aligned and seeded.",
      owner: "ops",
      auditEvent: "launch.qa.demo_accounts",
      required: true,
    },
    {
      id: "qa-e2e",
      label: "End-to-end launch walkthrough",
      status: input.e2eCompleted ? "pass" : "warning",
      evidence: input.e2eCompleted ? "Customer, provider, admin, payment, dispute, notification flows completed." : "Manual E2E checklist remains open.",
      owner: "ops",
      auditEvent: "launch.qa.e2e",
      required: true,
    },
  ];
}
