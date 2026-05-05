// VeloCity Governance Layer — GABRIEL policy gatekeeper
// Every significant state change must pass through here

import { runAgent } from "@/lib/agents/runAgent";
import { getAdminClient } from "@/lib/supabase/admin";
import type { JobStatus, UserRole } from "@/types";

export interface GovernanceResult {
  approved: boolean;
  reason?: string;
  risk_level: "low" | "medium" | "high" | "blocked";
  policy_violations: string[];
}

interface StateChangeRequest {
  jobId: string;
  fromStatus: JobStatus;
  toStatus: JobStatus;
  actorRole: UserRole;
  reason?: string;
}

// Hard-coded policy rules (run before GABRIEL to avoid AI latency on blockers)
function checkHardPolicies(req: StateChangeRequest): GovernanceResult | null {
  const { fromStatus, toStatus, actorRole } = req;

  // Prevent anyone bypassing quote approval
  if (toStatus === "in_progress" && fromStatus === "quote_submitted") {
    return {
      approved: false,
      reason: "Quote must be approved by customer before work begins",
      risk_level: "blocked",
      policy_violations: ["quote_bypass"],
    };
  }

  // Prevent customer from directly completing a job (must go through provider)
  if (toStatus === "completed_pending_confirmation" && actorRole === "customer") {
    return {
      approved: false,
      reason: "Only providers can mark a job as pending confirmation",
      risk_level: "blocked",
      policy_violations: ["invalid_actor_for_completion"],
    };
  }

  // Prevent reopening a closed job
  if (fromStatus === "closed" || fromStatus === "cancelled") {
    return {
      approved: false,
      reason: `Cannot transition from terminal status: ${fromStatus}`,
      risk_level: "blocked",
      policy_violations: ["terminal_state_reopen"],
    };
  }

  return null; // no hard block
}

export async function checkGovernance(req: StateChangeRequest): Promise<GovernanceResult> {
  // ── 1. Hard policy check (synchronous, no AI) ────────────
  const hardBlock = checkHardPolicies(req);
  if (hardBlock) {
    await auditGovernance(req, hardBlock);
    return hardBlock;
  }

  // ── 2. GABRIEL AI policy check ────────────────────────────
  const gabrielResult = await runAgent("GABRIEL", {
    action: "state_transition",
    payload: {
      job_id: req.jobId,
      from_status: req.fromStatus,
      to_status: req.toStatus,
      actor_role: req.actorRole,
      reason: req.reason,
    },
    jobId: req.jobId,
  });

  const gabrielData = gabrielResult.data as {
    approved?: boolean;
    policy_violations?: string[];
    risk_level?: "low" | "medium" | "high" | "blocked";
    reasoning?: string;
    fallback?: boolean;
  } | null;

  const result: GovernanceResult = {
    approved: gabrielData?.approved ?? true, // default allow on AI failure
    reason: gabrielData?.reasoning,
    risk_level: gabrielData?.risk_level ?? "low",
    policy_violations: gabrielData?.policy_violations ?? [],
  };

  await auditGovernance(req, result);
  return result;
}

async function auditGovernance(req: StateChangeRequest, result: GovernanceResult): Promise<void> {
  try {
    const db = getAdminClient();
    await db.from("audit_logs").insert({
      actor_type: "agent",
      actor_id: "GABRIEL",
      action: result.approved ? "governance_approved" : "governance_blocked",
      resource: "jobs",
      resource_id: req.jobId,
      payload: {
        from_status: req.fromStatus,
        to_status: req.toStatus,
        actor_role: req.actorRole,
        risk_level: result.risk_level,
        policy_violations: result.policy_violations,
        reason: result.reason,
      },
    });
  } catch {
    // non-blocking
  }
}
