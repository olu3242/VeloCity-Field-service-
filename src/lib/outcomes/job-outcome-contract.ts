import type { JobStatus } from "@/types";

export const JOB_OUTCOME_CONTRACT_ID = "standard-service-job";
export const JOB_OUTCOME_CONTRACT_VERSION = "1.0.0";

export type OutcomeStage =
  | "intake"
  | "dispatch"
  | "execution"
  | "verification"
  | "financial_closeout"
  | "recovery"
  | "complete";

export type OutcomeVerdict = "in_progress" | "blocked" | "satisfied" | "failed";

export interface OutcomeCheckpoint {
  id: string;
  label: string;
  satisfied: boolean;
  evidence: string[];
  blockingReason?: string;
}

export interface JobOutcomeSnapshot {
  contractId: typeof JOB_OUTCOME_CONTRACT_ID;
  contractVersion: typeof JOB_OUTCOME_CONTRACT_VERSION;
  stage: OutcomeStage;
  verdict: OutcomeVerdict;
  progressPercent: number;
  checkpoints: OutcomeCheckpoint[];
  nextAction: string | null;
  requiresHumanAction: boolean;
}

export interface JobOutcomeFacts {
  status: JobStatus;
  classificationPresent: boolean;
  providerAssigned: boolean;
  beforeEvidenceCount: number;
  afterEvidenceCount: number;
  customerConfirmed: boolean;
  capturedPaymentCount: number;
  auditEventCount: number;
  unresolvedDisputeCount: number;
}

const EXECUTION_STATUSES: JobStatus[] = [
  "in_progress",
  "change_order_submitted",
  "awaiting_change_order_approval",
  "change_order_approved",
  "completed_pending_confirmation",
  "customer_confirmed",
  "completed",
  "closed",
];

const TERMINAL_FAILURE_STATUSES: JobStatus[] = ["cancelled", "expired", "refunded"];

export function evaluateJobOutcome(facts: JobOutcomeFacts): JobOutcomeSnapshot {
  const intake = facts.classificationPresent;
  const dispatch = facts.providerAssigned;
  const execution = EXECUTION_STATUSES.includes(facts.status) && facts.beforeEvidenceCount > 0;
  const verification = facts.afterEvidenceCount > 0 && facts.customerConfirmed;
  const financialCloseout = facts.capturedPaymentCount > 0;
  const audit = facts.auditEventCount > 0;
  const recovered = facts.unresolvedDisputeCount === 0;
  const failed = TERMINAL_FAILURE_STATUSES.includes(facts.status);

  const checkpoints: OutcomeCheckpoint[] = [
    {
      id: "qualified_intake",
      label: "Request classified and serviceability determined",
      satisfied: intake,
      evidence: intake ? ["jobs.ai_classification"] : [],
      ...(!intake ? { blockingReason: "Classification evidence is missing." } : {}),
    },
    {
      id: "governed_dispatch",
      label: "Eligible provider assigned",
      satisfied: dispatch,
      evidence: dispatch ? ["jobs.provider_id"] : [],
      ...(!dispatch ? { blockingReason: "No provider is assigned." } : {}),
    },
    {
      id: "execution_evidence",
      label: "Provider started work with before evidence",
      satisfied: execution,
      evidence: facts.beforeEvidenceCount > 0 ? [`job_photos.before:${facts.beforeEvidenceCount}`] : [],
      ...(!execution ? { blockingReason: "Work has not started with required before evidence." } : {}),
    },
    {
      id: "verified_completion",
      label: "After evidence captured and customer confirmed",
      satisfied: verification,
      evidence: [
        ...(facts.afterEvidenceCount > 0 ? [`job_photos.after:${facts.afterEvidenceCount}`] : []),
        ...(facts.customerConfirmed ? ["job_status_history.customer_confirmed"] : []),
      ],
      ...(!verification ? { blockingReason: "Completion evidence or customer confirmation is missing." } : {}),
    },
    {
      id: "financial_closeout",
      label: "Payment captured exactly through the payment ledger",
      satisfied: financialCloseout,
      evidence: financialCloseout ? [`payments.captured:${facts.capturedPaymentCount}`] : [],
      ...(!financialCloseout ? { blockingReason: "No captured payment is recorded." } : {}),
    },
    {
      id: "auditable_recovery",
      label: "Audit evidence exists and no dispute remains unresolved",
      satisfied: audit && recovered,
      evidence: audit ? [`job_status_history:${facts.auditEventCount}`] : [],
      ...(!audit || !recovered
        ? { blockingReason: !recovered ? "An unresolved dispute requires human action." : "Audit evidence is missing." }
        : {}),
    },
  ];

  const satisfiedCount = checkpoints.filter((checkpoint) => checkpoint.satisfied).length;
  const allSatisfied = satisfiedCount === checkpoints.length;
  const requiresHumanAction = facts.unresolvedDisputeCount > 0 || facts.status === "completed_pending_confirmation";

  let stage: OutcomeStage = "intake";
  if (intake) stage = "dispatch";
  if (dispatch) stage = "execution";
  if (execution) stage = "verification";
  if (verification) stage = "financial_closeout";
  if (financialCloseout) stage = "recovery";
  if (allSatisfied) stage = "complete";

  const nextCheckpoint = checkpoints.find((checkpoint) => !checkpoint.satisfied);

  return {
    contractId: JOB_OUTCOME_CONTRACT_ID,
    contractVersion: JOB_OUTCOME_CONTRACT_VERSION,
    stage,
    verdict: failed ? "failed" : allSatisfied ? "satisfied" : requiresHumanAction ? "blocked" : "in_progress",
    progressPercent: Math.round((satisfiedCount / checkpoints.length) * 100),
    checkpoints,
    nextAction: nextCheckpoint?.blockingReason ?? null,
    requiresHumanAction,
  };
}

