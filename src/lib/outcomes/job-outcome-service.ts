import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobStatus } from "@/types";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  evaluateJobOutcome,
  JOB_OUTCOME_CONTRACT_ID,
  JOB_OUTCOME_CONTRACT_VERSION,
  type JobOutcomeSnapshot,
} from "./job-outcome-contract";

interface SyncJobOutcomeInput {
  supabase: SupabaseClient;
  jobId: string;
  tenantId: string;
}

export async function syncJobOutcome({
  supabase,
  jobId,
  tenantId,
}: SyncJobOutcomeInput): Promise<JobOutcomeSnapshot> {
  const [jobResult, beforeResult, afterResult, confirmationResult, paymentsResult, historyResult, disputesResult] =
    await Promise.all([
      supabase
        .from("jobs")
        .select("id,status,provider_id,ai_classification")
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .single(),
      supabase
        .from("job_photos")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .eq("photo_type", "before"),
      supabase
        .from("job_photos")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .eq("photo_type", "after"),
      supabase
        .from("job_status_history")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .eq("to_status", "customer_confirmed"),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .in("status", ["captured", "escrowed", "paid"]),
      supabase
        .from("job_status_history")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId),
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .eq("tenant_id", tenantId)
        .not("status", "in", "(resolved,closed,rejected)"),
    ]);

  if (jobResult.error || !jobResult.data) {
    throw new Error(jobResult.error?.message ?? "Job not found while evaluating outcome.");
  }

  const evidenceErrors = [
    beforeResult.error,
    afterResult.error,
    confirmationResult.error,
    paymentsResult.error,
    historyResult.error,
    disputesResult.error,
  ].filter((error): error is NonNullable<typeof error> => Boolean(error));
  if (evidenceErrors.length > 0) {
    throw new Error(`Outcome evidence is incomplete: ${evidenceErrors.map((error) => error.message).join("; ")}`);
  }

  const classification = jobResult.data.ai_classification;
  const classificationPresent = Boolean(
    classification && typeof classification === "object" && Object.keys(classification).length > 0
  );

  const snapshot = evaluateJobOutcome({
    status: jobResult.data.status as JobStatus,
    classificationPresent,
    providerAssigned: Boolean(jobResult.data.provider_id),
    beforeEvidenceCount: beforeResult.count ?? 0,
    afterEvidenceCount: afterResult.count ?? 0,
    customerConfirmed: (confirmationResult.count ?? 0) > 0,
    capturedPaymentCount: paymentsResult.count ?? 0,
    auditEventCount: historyResult.count ?? 0,
    unresolvedDisputeCount: disputesResult.count ?? 0,
  });

  // Reads honor the caller's tenant-scoped session. Projection writes use the
  // server-only service client because RLS deliberately exposes no user write policy.
  const writer = getAdminClient();
  const { error } = await writer.from("workflow_outcome_instances").upsert(
    {
      tenant_id: tenantId,
      job_id: jobId,
      contract_id: JOB_OUTCOME_CONTRACT_ID,
      contract_version: JOB_OUTCOME_CONTRACT_VERSION,
      stage: snapshot.stage,
      verdict: snapshot.verdict,
      progress_percent: snapshot.progressPercent,
      requires_human_action: snapshot.requiresHumanAction,
      next_action: snapshot.nextAction,
      checkpoints: snapshot.checkpoints,
      completed_at: snapshot.verdict === "satisfied" ? new Date().toISOString() : null,
    },
    { onConflict: "job_id,contract_id,contract_version" }
  );

  if (error) throw new Error(`Unable to persist job outcome: ${error.message}`);
  return snapshot;
}
