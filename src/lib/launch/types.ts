export type LaunchStatus = "pass" | "warning" | "fail" | "blocked";

export interface LaunchChecklistItem {
  id: string;
  label: string;
  status: LaunchStatus;
  evidence: string;
  owner: "engineering" | "ops" | "security" | "finance" | "ai" | "growth";
  auditEvent: string;
  required: boolean;
}

export interface LaunchBlocker {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  owner: LaunchChecklistItem["owner"];
  auditEvent: string;
  resolved: boolean;
}

export interface LaunchReadinessSection {
  name: string;
  score: number;
  status: LaunchStatus;
  items: LaunchChecklistItem[];
}

export interface LaunchReadinessReport {
  score: number;
  status: LaunchStatus;
  sections: LaunchReadinessSection[];
  blockers: LaunchBlocker[];
  nextActions: LaunchBlocker[];
}

export function statusWeight(status: LaunchStatus): number {
  if (status === "pass") return 1;
  if (status === "warning") return 0.65;
  if (status === "fail") return 0.25;
  return 0;
}

export function statusFromScore(score: number): LaunchStatus {
  if (score >= 85) return "pass";
  if (score >= 65) return "warning";
  if (score >= 35) return "fail";
  return "blocked";
}

export function scoreItems(items: LaunchChecklistItem[]): number {
  const requiredWeight = items.reduce((sum, item) => sum + (item.required ? 2 : 1), 0) || 1;
  const weighted = items.reduce((sum, item) => sum + statusWeight(item.status) * (item.required ? 2 : 1), 0);
  return Math.round((weighted / requiredWeight) * 100);
}
