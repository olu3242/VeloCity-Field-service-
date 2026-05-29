import "@/runtime/server-only";
import type { AutomationWorkerResult } from "@/lib/automation/worker";

export function summarizeAutomationResult(result: AutomationWorkerResult) {
  const attempted = result.processed || 1;
  return {
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    successRate: result.succeeded / attempted,
  };
}
