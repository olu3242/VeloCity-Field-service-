import { RelatedList } from "./RelatedList";

export function JobEventsList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Events" table="job_status_history" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="to_status" statusColumn="to_status" secondaryColumn="reason" />;
}
