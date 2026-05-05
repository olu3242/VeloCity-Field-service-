import type { LaunchBlocker, LaunchChecklistItem } from "./types";

export function buildBlockerTracker(items: LaunchChecklistItem[]): LaunchBlocker[] {
  return items
    .filter((item) => item.status === "blocked" || item.status === "fail")
    .map((item) => ({
      id: `blocker-${item.id}`,
      severity: item.required ? "critical" : "medium",
      title: item.label,
      description: item.evidence,
      owner: item.owner,
      auditEvent: `blocker.${item.auditEvent}`,
      resolved: false,
    }));
}
