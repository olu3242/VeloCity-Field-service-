import { JobStatus, JobLifecycleEvent } from "./operations-types";

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["accepted", "cancelled"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed", "disputed", "cancelled"],
  completed: ["disputed"],
  disputed: ["completed", "cancelled"],
  cancelled: [],
};

export function isValidTransition(from: JobStatus, to: JobStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(status: JobStatus): JobStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

export function buildLifecycleEvent(
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  actorId: string
): JobLifecycleEvent {
  return {
    jobId,
    fromStatus: from,
    toStatus: to,
    actorId,
    timestamp: new Date().toISOString(),
  };
}
