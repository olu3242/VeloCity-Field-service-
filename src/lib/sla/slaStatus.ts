import { getArrivalDeadline, getSlaRemainingMs } from "./slaTimer";

export function getSlaStatus(job: Record<string, unknown>) {
  const deadline = getArrivalDeadline({ dispatchTime: job.dispatch_time as string | null, urgency: job.urgency as string | null });
  const remainingMs = getSlaRemainingMs(deadline);
  const arrived = Boolean(job.arrival_time || job.checked_in_at);
  const breached = !arrived && remainingMs < 0;
  const warning = !arrived && remainingMs > 0 && remainingMs < 30 * 60_000;
  return {
    deadline: deadline.toISOString(),
    remainingMs,
    arrived,
    warning,
    breached,
    label: arrived ? "Arrived" : breached ? "SLA breach" : warning ? "SLA warning" : "On track",
  };
}
