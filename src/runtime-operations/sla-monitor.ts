import { SLAConfig } from "./operations-types";

export function minutesSince(isoTimestamp: string): number {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  return diffMs / (1000 * 60);
}

export function getDefaultSLAConfig(urgency: "scheduled" | "same_day" | "emergency"): SLAConfig {
  switch (urgency) {
    case "emergency":
      return { maxResponseMinutes: 15, maxArrivalMinutes: 30, maxCompletionHours: 4 };
    case "same_day":
      return { maxResponseMinutes: 60, maxArrivalMinutes: 120, maxCompletionHours: 8 };
    case "scheduled":
      return { maxResponseMinutes: 1440, maxArrivalMinutes: 1440, maxCompletionHours: 24 };
  }
}

export function checkSLABreach(
  job: { createdAt: string; acceptedAt?: string; startedAt?: string },
  config: SLAConfig
): { breached: boolean; breachType?: string; overByMinutes?: number } {
  // Check response SLA (time from created to accepted)
  if (!job.acceptedAt) {
    const responseMinutes = minutesSince(job.createdAt);
    if (responseMinutes > config.maxResponseMinutes) {
      return {
        breached: true,
        breachType: "response",
        overByMinutes: Math.floor(responseMinutes - config.maxResponseMinutes),
      };
    }
  }

  // Check arrival SLA (time from created to started)
  if (job.acceptedAt && !job.startedAt) {
    const arrivalMinutes = minutesSince(job.createdAt);
    if (arrivalMinutes > config.maxArrivalMinutes) {
      return {
        breached: true,
        breachType: "arrival",
        overByMinutes: Math.floor(arrivalMinutes - config.maxArrivalMinutes),
      };
    }
  }

  // Check completion SLA (time from started to now)
  if (job.startedAt) {
    const completionMinutes = minutesSince(job.startedAt);
    const maxCompletionMinutes = config.maxCompletionHours * 60;
    if (completionMinutes > maxCompletionMinutes) {
      return {
        breached: true,
        breachType: "completion",
        overByMinutes: Math.floor(completionMinutes - maxCompletionMinutes),
      };
    }
  }

  return { breached: false };
}
