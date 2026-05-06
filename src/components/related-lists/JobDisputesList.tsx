import { RelatedList } from "./RelatedList";

export function JobDisputesList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Disputes" table="disputes" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="reason" statusColumn="status" href={(row) => `/admin/disputes/${row.id}`} />;
}
