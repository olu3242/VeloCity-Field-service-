import { buildBlockerTracker } from "./blockerTracker";
import { scoreItems, statusFromScore, type LaunchChecklistItem, type LaunchReadinessReport, type LaunchReadinessSection } from "./types";

export function buildReadinessSection(name: string, items: LaunchChecklistItem[]): LaunchReadinessSection {
  const score = scoreItems(items);
  return {
    name,
    score,
    status: statusFromScore(score),
    items,
  };
}

export function calculateLaunchReadiness(sections: LaunchReadinessSection[]): LaunchReadinessReport {
  const allItems = sections.flatMap((section) => section.items);
  const blockers = buildBlockerTracker(allItems);
  const score = sections.length ? Math.round(sections.reduce((sum, section) => sum + section.score, 0) / sections.length) : 0;
  return {
    score,
    status: blockers.some((blocker) => blocker.severity === "critical") ? "blocked" : statusFromScore(score),
    sections,
    blockers,
    nextActions: blockers.slice(0, 6),
  };
}
