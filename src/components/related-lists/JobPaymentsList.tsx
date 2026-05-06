import { RelatedList } from "./RelatedList";

export function JobPaymentsList({ tenantId, jobId }: { tenantId: string; jobId: string }) {
  return <RelatedList title="Job Payments" table="payments" tenantId={tenantId} filters={[{ column: "job_id", value: jobId }]} primaryColumn="type" statusColumn="status" amountColumn="amount_cents" />;
}
