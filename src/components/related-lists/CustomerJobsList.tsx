import { RelatedList } from "./RelatedList";

export function CustomerJobsList({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  return <RelatedList title="Customer Jobs" table="jobs" tenantId={tenantId} filters={[{ column: "customer_id", value: customerId }]} primaryColumn="title" statusColumn="status" amountColumn="final_cost_cents" href={(row) => `/admin/jobs/${row.id}`} />;
}
