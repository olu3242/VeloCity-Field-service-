import type { ServiceCategory } from "@/types";
import { recommendRebookingWindow } from "./rebookingRules";

export function buildMaintenanceReminder(category: ServiceCategory, customerName = "there") {
  const window = recommendRebookingWindow(category);
  return {
    sendAfterDays: window.days,
    title: "Time for a maintenance check",
    body: `Hi ${customerName}, it may be time to schedule your next ${category.replace("_", " ")} service.`,
    reason: window.reason,
  };
}
