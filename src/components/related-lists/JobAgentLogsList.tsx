import { RelatedList } from "./RelatedList";

export function JobAgentLogsList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Agent Logs" table="agent_logs" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="agent_name" statusColumn="action" secondaryColumn="error" />;
}
