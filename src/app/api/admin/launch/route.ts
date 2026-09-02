// GET  /api/admin/launch — required checklist inputs and scoring thresholds
// POST /api/admin/launch — deployment_checklist | environment_checklist | qa_checklist
//                          | blocker_tracker | readiness_report
// Admin-only; tenant-scoped. Pure launch-gate evaluation — every checklist is derived
// from supplied status flags, no persisted state.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenancy";
import {
  buildDeploymentChecklist,
  type DeploymentStatusInput,
} from "@/lib/launch/deploymentChecklist";
import {
  buildEnvironmentChecklist,
  type EnvironmentStatusInput,
} from "@/lib/launch/environmentChecklist";
import { buildQaChecklist, type QaStatusInput } from "@/lib/launch/qaChecklist";
import { buildBlockerTracker } from "@/lib/launch/blockerTracker";
import {
  buildReadinessSection,
  calculateLaunchReadiness,
} from "@/lib/launch/readinessScore";
import type { LaunchReadinessSection } from "@/lib/launch/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEPLOYMENT_FIELDS: Array<keyof DeploymentStatusInput> = [
  "supabaseLinked", "migrationsAligned", "rlsAudited", "vercelConfigured", "domainConfigured",
];
const ENVIRONMENT_FIELDS: Array<keyof EnvironmentStatusInput> = [
  "coreConfigured", "supabaseConfigured", "adminSupabaseConfigured", "stripeConfigured",
  "aiConfigured", "googleConfigured", "smsConfigured", "emailConfigured",
];
const QA_FIELDS: Array<keyof QaStatusInput> = [
  "typecheckPassed", "lintPassed", "buildPassed", "demoAccountsVerified", "e2eCompleted",
];

/**
 * Reads a set of boolean flags from a raw input object.
 *
 * Missing flags default to false rather than true: an unreported check has not
 * passed, and defaulting the other way would let an incomplete request report a
 * clean launch gate.
 */
function readFlags<K extends string>(
  raw: unknown,
  fields: readonly K[]
): Record<K, boolean> {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<K, boolean>;
  for (const field of fields) {
    out[field] = source[field] === true;
  }
  return out;
}

function reportedFields(raw: unknown, fields: readonly string[]): string[] {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return fields.filter((f) => typeof source[f] === "boolean");
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "Forbidden", status: 403 as const, profile: null };
  }

  return { error: null, status: 200 as const, profile };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  void request;

  return NextResponse.json({
    requiredInputs: {
      deployment: DEPLOYMENT_FIELDS,
      environment: ENVIRONMENT_FIELDS,
      qa: QA_FIELDS,
    },
    scoring: {
      thresholds: { pass: 85, warning: 65, fail: 35, blocked: "below 35" },
      weights: { pass: 1, warning: 0.65, fail: 0.25, blocked: 0 },
      note: "Required items carry double weight. Any critical blocker forces overall status to 'blocked' regardless of score.",
    },
    defaulting: {
      note: "Unreported boolean flags default to false — an unreported check is treated as not passed.",
    },
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  getTenantId(auth.profile);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body required" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const { action } = raw;

  if (action === "deployment_checklist") {
    const input = readFlags(raw.deployment ?? raw, DEPLOYMENT_FIELDS);
    const items = buildDeploymentChecklist(input);
    return NextResponse.json({
      action: "deployment_checklist",
      section: buildReadinessSection("Deployment", items),
      reportedFields: reportedFields(raw.deployment ?? raw, DEPLOYMENT_FIELDS),
      success: true,
    });
  }

  if (action === "environment_checklist") {
    const input = readFlags(raw.environment ?? raw, ENVIRONMENT_FIELDS);
    const items = buildEnvironmentChecklist(input);
    return NextResponse.json({
      action: "environment_checklist",
      section: buildReadinessSection("Environment", items),
      reportedFields: reportedFields(raw.environment ?? raw, ENVIRONMENT_FIELDS),
      success: true,
    });
  }

  if (action === "qa_checklist") {
    const input = readFlags(raw.qa ?? raw, QA_FIELDS);
    const items = buildQaChecklist(input);
    return NextResponse.json({
      action: "qa_checklist",
      section: buildReadinessSection("QA", items),
      reportedFields: reportedFields(raw.qa ?? raw, QA_FIELDS),
      success: true,
    });
  }

  if (action === "blocker_tracker" || action === "readiness_report") {
    const { deployment, environment, qa } = raw;

    // At least one section must be supplied — an empty report would otherwise
    // score 0 and read as "blocked" when nothing was actually assessed.
    if (
      (!deployment || typeof deployment !== "object") &&
      (!environment || typeof environment !== "object") &&
      (!qa || typeof qa !== "object")
    ) {
      return NextResponse.json(
        { error: "At least one of 'deployment', 'environment', or 'qa' input objects required" },
        { status: 400 }
      );
    }

    const sections: LaunchReadinessSection[] = [];
    const assessed: string[] = [];

    if (deployment && typeof deployment === "object") {
      sections.push(
        buildReadinessSection("Deployment", buildDeploymentChecklist(readFlags(deployment, DEPLOYMENT_FIELDS)))
      );
      assessed.push("deployment");
    }
    if (environment && typeof environment === "object") {
      sections.push(
        buildReadinessSection("Environment", buildEnvironmentChecklist(readFlags(environment, ENVIRONMENT_FIELDS)))
      );
      assessed.push("environment");
    }
    if (qa && typeof qa === "object") {
      sections.push(buildReadinessSection("QA", buildQaChecklist(readFlags(qa, QA_FIELDS))));
      assessed.push("qa");
    }

    if (action === "blocker_tracker") {
      const blockers = buildBlockerTracker(sections.flatMap((s) => s.items));
      return NextResponse.json({
        action: "blocker_tracker",
        blockers,
        critical: blockers.filter((b) => b.severity === "critical"),
        assessedSections: assessed,
        success: true,
      });
    }

    const report = calculateLaunchReadiness(sections);
    return NextResponse.json({
      action: "readiness_report",
      report,
      assessedSections: assessed,
      // Partial assessments cannot certify a launch — say so explicitly rather
      // than letting a two-section "pass" read as full clearance.
      complete: assessed.length === 3,
      success: true,
    });
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Use 'deployment_checklist', 'environment_checklist', 'qa_checklist', 'blocker_tracker', or 'readiness_report'.`,
    },
    { status: 400 }
  );
}
