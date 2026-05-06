import { RelatedList } from "./RelatedList";

export function JobQuotesList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Quotes" table="quotes" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="notes" statusColumn="status" amountColumn="total_cents" />;
}
