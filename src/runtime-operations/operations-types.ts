export type JobStatus =
  | "draft"
  | "submitted"
  | "accepted"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled";

export interface JobLifecycleEvent {
  jobId: string;
  fromStatus: JobStatus;
  toStatus: JobStatus;
  actorId: string;
  reason?: string;
  timestamp: string;
}

export interface SLAConfig {
  maxResponseMinutes: number;
  maxArrivalMinutes: number;
  maxCompletionHours: number;
}

export interface IncidentRecord {
  id: string;
  jobId: string;
  type: "sla_breach" | "no_show" | "dispute" | "payment_failure" | "provider_cancellation";
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "escalated";
  createdAt: string;
  resolvedAt?: string;
}
