import { RelatedList } from "./RelatedList";

export function JobMessagesList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Messages" table="job_messages" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="message" statusColumn="sender_role" />;
}
